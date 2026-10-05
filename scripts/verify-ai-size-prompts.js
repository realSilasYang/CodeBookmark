/**
 * 核对大文件与大响应的确认提示、字节显示和用户取消路径，防止容量保护被静默跳过。
 * 脚本直接调用编译后的 `AIService`、`ExtensionConfig`、`AIRequestPolicy`，只在 VS Code 或文件系统边界使用最小替身。
 */
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

let configuredAddress = ''
Object.defineProperties(ExtensionConfig, {
  aiAddress: { configurable: true, get: () => configuredAddress },
  aiAPIKey: { configurable: true, get: () => 'test-key' },
  aiModel: { configurable: true, get: () => 'test-model' },
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

async function verifyUnrestrictedWaiting() {
  const timeoutCalls = []
  const originalRequest = http.request
  http.request = (...args) => {
    const clientRequest = originalRequest(...args)
    // 模拟连接继承的短空闲时限，检查传输层是否明确关闭它。
    clientRequest.setTimeout(50, () => clientRequest.destroy(new Error('inherited idle timeout')))
    const originalSetTimeout = clientRequest.setTimeout
    clientRequest.setTimeout = function (milliseconds, ...rest) {
      timeoutCalls.push(milliseconds)
      return originalSetTimeout.call(this, milliseconds, ...rest)
    }
    return clientRequest
  }

  let requestNumber = 0
  const delayedServer = http.createServer((_request, response) => {
    requestNumber++
    if (requestNumber === 2) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.write(' ')
    }
    const timer = setTimeout(() => {
      response.end('{"choices":[{"message":{"content":"delayed response complete"}}]}')
    }, 250)
    response.once('close', () => clearTimeout(timer))
  })
  try {
    await listen(delayedServer)
    configuredAddress = `http://127.0.0.1:${delayedServer.address().port}/v1/chat/completions`
    // 首字节前没有数据和两个响应块之间无数据，都应等到完整结果。
    for (let index = 0; index < 2; index++) {
      const response = await AIService.sendRequest([{ role: 'user', content: 'hello' }])
      assert.equal(response, 'delayed response complete')
    }
    assert.deepEqual(timeoutCalls, [0, 0])
  } finally {
    http.request = originalRequest
    await close(delayedServer)
  }
}

async function verifyCancellationWhileWaiting() {
  let listener
  let cancellationDisposed = false
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: callback => {
      listener = callback
      return { dispose() { listener = undefined; cancellationDisposed = true } }
    },
  }
  const waitingServer = http.createServer(() => {
    token.isCancellationRequested = true
    listener()
  })
  try {
    await listen(waitingServer)
    configuredAddress = `http://127.0.0.1:${waitingServer.address().port}/v1/chat/completions`
    await assert.rejects(
      AIService.sendRequest([{ role: 'user', content: 'hello' }], undefined, token),
      error => error.isUserCancellation === true,
    )
    assert.equal(cancellationDisposed, true)
  } finally {
    await close(waitingServer)
  }
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

  warningHandler = async () => undefined
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
  configuredAddress = `http://127.0.0.1:${address.port}/v1/chat/completions`

  try {
    warningMessages.length = 0
    warningHandler = async (message, _options, continueAction) => {
      warningMessages.push(message)
      return continueAction
    }
    const response = await AIService.sendRequest([{ role: 'user', content: 'hello' }])
    assert.equal(response.length, oversizedContent.length)
    assert.equal(warningMessages.length, 1)
    assert.match(warningMessages[0], /2\.00 MiB/)

    warningHandler = async () => undefined
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
    configuredAddress = `http://127.0.0.1:${declaredAddress.port}/v1/chat/completions`
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
    configuredAddress = `http://127.0.0.1:${chunkedAddress.port}/v1/chat/completions`
    warningHandler = async (_message, _options, continueAction) => continueAction
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
        response.end('{"choices":[{"message":{"content":"stream complete"}}]}')
      }, 250)
    })
    await listen(slowStreamingServer)
    const slowAddress = slowStreamingServer.address()
    configuredAddress = `http://127.0.0.1:${slowAddress.port}/v1/chat/completions`
    try {
      const response = await AIService.sendRequest([{ role: 'user', content: 'hello' }])
      assert.equal(response, 'stream complete')
    } finally {
      await close(slowStreamingServer)
    }
    await verifyUnrestrictedWaiting()
    await verifyCancellationWhileWaiting()
  } finally {
    await close(server)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
