/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-routing`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-routing` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-routing”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const http = require('node:http')
const { installModuleMocks } = require('./test-support/module-mocks')

const vscodeMock = {
  window: {
    showWarningMessage: async (_message, _options, continueLabel) => continueLabel,
    showInformationMessage: async () => undefined,
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
  },
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
  },
}

const restoreModules = installModuleMocks({ vscode: vscodeMock })
const { AIService } = require('../out/util/AIService')
const { ExtensionConfig } = require('../out/config/ExtensionConfig')
restoreModules()

let configuredAddress = ''
let apiKey = 'test-key'
Object.defineProperties(ExtensionConfig, {
  aiAddress: { configurable: true, get: () => configuredAddress },
  aiAPIKey: { configurable: true, get: () => apiKey },
  aiModel: { configurable: true, get: () => 'test-model' },
  aiTimeoutS: { configurable: true, get: () => 10 },
})

let scenario = () => ({ status: 500, body: { error: 'scenario not configured' } })
let requests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    const record = {
      url: request.url,
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    }
    requests.push(record)
    const result = scenario(record, requests.length)
    response.writeHead(result.status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(result.body))
  })
})

async function main() {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()

  configuredAddress = `http://127.0.0.1:${port}`
  requests = []
  scenario = (_request, count) => count === 1
    ? { status: 404, body: { error: 'missing v1 route' } }
    : { status: 200, body: { choices: [{ message: { content: 'chat fallback' } }] } }
  assert.equal(await AIService.sendRequest([{ role: 'user', content: 'hello' }]), 'chat fallback')
  assert.deepEqual(requests.map(request => request.url), [
    '/v1/chat/completions',
    '/chat/completions',
  ])
  assert.ok(requests.every(request => request.headers.authorization === 'Bearer test-key'))

  requests = []
  scenario = (_request, count) => count === 1
    ? { status: 404, body: { error: 'missing v1 route' } }
    : { status: 200, body: { choices: [{ message: { content: 'connection ok' } }] } }
  assert.equal(
    await AIService.testConnection(),
    `http://127.0.0.1:${port}/chat/completions`,
    'connection tests must report the candidate URL that actually succeeded',
  )
  assert.deepEqual(requests.map(request => request.url), [
    '/v1/chat/completions',
    '/chat/completions',
  ])

  requests = []
  scenario = (_request, count) => count <= 2
    ? { status: 404, body: { error: 'chat route unavailable' } }
    : { status: 200, body: { output: [{ content: [{ type: 'output_text', text: 'responses fallback' }] }] } }
  assert.equal(await AIService.sendRequest([{ role: 'user', content: 'hello' }]), 'responses fallback')
  assert.deepEqual(requests.map(request => request.url), [
    '/v1/chat/completions',
    '/chat/completions',
    '/v1/responses',
  ])
  assert.deepEqual(requests[2].body, {
    model: 'test-model',
    input: [{ role: 'user', content: 'hello' }],
    store: false,
  })

  requests = []
  scenario = () => ({
    status: 404,
    body: { error: { code: 'DeploymentNotFound', message: 'The configured deployment does not exist.' } },
  })
  await assert.rejects(AIService.sendRequest([{ role: 'user', content: 'hello' }]), error => {
    assert.equal(error.statusCode, 404)
    assert.equal(error.serviceErrorCode, 'DeploymentNotFound')
    return true
  })
  assert.equal(requests.length, 1, 'deployment 404 must not be mistaken for a missing route')

  requests = []
  scenario = () => ({
    status: 404,
    body: { error: { code: 'model_not_found', message: 'The requested model was not found.' } },
  })
  await assert.rejects(AIService.sendRequest([{ role: 'user', content: 'hello' }]), error => {
    assert.equal(error.serviceErrorCode, 'model_not_found')
    return true
  })
  assert.equal(requests.length, 1, 'model 404 must not be mistaken for a missing route')

  for (const status of [400, 401, 403, 429, 500, 503]) {
    requests = []
    scenario = () => ({ status, body: { error: `status ${status}` } })
    await assert.rejects(AIService.sendRequest([{ role: 'user', content: 'hello' }]), error => {
      assert.equal(error.statusCode, status)
      return true
    })
    assert.equal(requests.length, 1, `status ${status} must not retry another route`)
  }

  configuredAddress = `http://127.0.0.1:${port}/v1/chat/completions?api_key=query-secret`
  requests = []
  scenario = () => ({ status: 401, body: { error: 'invalid key' } })
  await assert.rejects(AIService.sendRequest([{ role: 'user', content: 'hello' }]), error => {
    assert.doesNotMatch(error.message, /query-secret|api_key/)
    return true
  })

  configuredAddress = `http://127.0.0.1:${port}`
  requests = []
  scenario = (_request, count) => count === 1
    ? { status: 405, body: { error: 'method not available on route' } }
    : { status: 200, body: { choices: [{ message: { content: 'method fallback' } }] } }
  assert.equal(await AIService.sendRequest([{ role: 'user', content: 'hello' }]), 'method fallback')
  assert.equal(requests.length, 2)

  configuredAddress = `http://127.0.0.1:${port}/v1/responses`
  requests = []
  scenario = () => ({ status: 200, body: { output_text: 'explicit responses' } })
  assert.equal(await AIService.sendRequest([{ role: 'user', content: 'hello' }]), 'explicit responses')
  assert.deepEqual(requests.map(request => request.url), ['/v1/responses'])

  configuredAddress = `http://127.0.0.1:${port}/v1/chat`
  requests = []
  scenario = () => ({ status: 404, body: { error: 'chat route unavailable' } })
  await assert.rejects(AIService.sendRequest([{ role: 'user', content: 'hello' }]), error => {
    assert.equal(error.statusCode, 404)
    return true
  })
  assert.deepEqual(
    requests.map(request => request.url),
    ['/v1/chat/completions'],
    'a partial Chat URL expresses protocol intent and must not fall back across protocols',
  )

  configuredAddress = `http://127.0.0.1:${port}/api/chat`
  apiKey = ''
  requests = []
  scenario = () => ({ status: 200, body: { message: { content: 'keyless Ollama' } } })
  assert.equal(await AIService.sendRequest([{ role: 'user', content: 'hello' }]), 'keyless Ollama')
  assert.equal(requests[0].headers.authorization, undefined)
  assert.equal(requests[0].body.stream, false)

  console.log('AI routing and fallback contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  server.close()
})
