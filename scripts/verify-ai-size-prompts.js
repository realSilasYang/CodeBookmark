const assert = require('node:assert/strict')
const http = require('node:http')
const { installModuleMocks } = require('./test-support/module-mocks')

let warningHandler = async (_message, _options, continueLabel) => continueLabel
const vscodeMock = {
  window: {
    showWarningMessage: (...args) => warningHandler(...args),
    showInformationMessage: async () => undefined,
    createOutputChannel: () => ({ appendLine: () => undefined, dispose: () => undefined }),
  },
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
  },
}

const restoreModules = installModuleMocks({ vscode: vscodeMock })

const { AIService } = require('../out/util/AIService')
const { ExtensionConfig } = require('../out/config/ExtensionConfig')
const {
  AI_REQUEST_MAX_BYTES,
  AI_RESPONSE_MAX_BYTES,
  AI_SOURCE_MAX_BYTES,
  AI_SOURCE_WARNING_BYTES,
} = require('../out/util/AIRequestPolicy')
restoreModules()

let endpoint = ''
let timeoutS = 10
Object.defineProperties(ExtensionConfig, {
  aiEndpoint: { configurable: true, get: () => endpoint },
  aiApiKey: { configurable: true, get: () => 'test-key' },
  aiModel: { configurable: true, get: () => 'test-model' },
  aiTimeoutS: { configurable: true, get: () => timeoutS },
})

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
}

async function close(server) {
  await new Promise(resolve => server.close(resolve))
}

async function main() {
  const warningMessages = []
  warningHandler = async (message, _options, continueLabel) => {
    warningMessages.push(message)
    return continueLabel
  }
  await AIService.confirmSourceSize(AI_SOURCE_WARNING_BYTES + 1, 'large.ts')
  assert.equal(warningMessages.length, 1)
  assert.match(warningMessages[0], /512 KiB/)

  warningHandler = async () => '取消'
  await assert.rejects(
    AIService.confirmSourceSize(AI_SOURCE_WARNING_BYTES + 1, 'large.ts'),
    /主动取消/
  )
  await assert.rejects(
    AIService.confirmSourceSize(AI_SOURCE_MAX_BYTES + 1, 'too-large.ts'),
    /处理上限/
  )

  const oversizedContent = 'x'.repeat(2 * 1024 * 1024 + 4096)
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content: oversizedContent } }] }))
  })
  await listen(server)
  const address = server.address()
  endpoint = `http://127.0.0.1:${address.port}/v1/chat/completions`

  try {
    warningMessages.length = 0
    warningHandler = async (message) => {
      warningMessages.push(message)
      return '继续接收'
    }
    const response = await AIService.sendRequest([{ role: 'user', content: 'hello' }])
    assert.equal(response.choices[0].message.content.length, oversizedContent.length)
    assert.equal(warningMessages.length, 1)
    assert.match(warningMessages[0], /2\.00 MiB/)

    warningHandler = async () => '取消'
    await assert.rejects(
      AIService.sendRequest([{ role: 'user', content: 'hello' }]),
      /主动取消/
    )
    await assert.rejects(
      AIService.sendRequest([{ role: 'user', content: 'x'.repeat(AI_REQUEST_MAX_BYTES) }]),
      /发送上限/
    )

    const declaredOversizeServer = http.createServer((_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': String(AI_RESPONSE_MAX_BYTES + 1),
      })
      response.end('{}')
    })
    await listen(declaredOversizeServer)
    const declaredAddress = declaredOversizeServer.address()
    endpoint = `http://127.0.0.1:${declaredAddress.port}/v1/chat/completions`
    try {
      await assert.rejects(
        AIService.sendRequest([{ role: 'user', content: 'hello' }]),
        /接收上限/
      )
    } finally {
      await close(declaredOversizeServer)
    }

    const chunkedOversizeServer = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.write('x'.repeat(AI_RESPONSE_MAX_BYTES))
      response.end('x')
    })
    await listen(chunkedOversizeServer)
    const chunkedAddress = chunkedOversizeServer.address()
    endpoint = `http://127.0.0.1:${chunkedAddress.port}/v1/chat/completions`
    warningHandler = async () => '继续接收'
    try {
      await assert.rejects(
        AIService.sendRequest([{ role: 'user', content: 'hello' }]),
        /接收上限/
      )
    } finally {
      await close(chunkedOversizeServer)
    }

    const slowStreamingServer = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      const interval = setInterval(() => response.write(' '), 10)
      setTimeout(() => {
        clearInterval(interval)
        response.end('{}')
      }, 250)
    })
    await listen(slowStreamingServer)
    const slowAddress = slowStreamingServer.address()
    endpoint = `http://127.0.0.1:${slowAddress.port}/v1/chat/completions`
    timeoutS = 0.05
    try {
      await assert.rejects(
        AIService.sendRequest([{ role: 'user', content: 'hello' }]),
        /总时长超过/
      )
    } finally {
      timeoutS = 10
      await close(slowStreamingServer)
    }
  } finally {
    await close(server)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
