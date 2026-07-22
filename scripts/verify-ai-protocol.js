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

const {
  AIService,
  isAIAuthenticationError,
  isAIRateLimitError,
} = require('../out/util/AIService')
const { repairJsonStringEscapes } = require('../out/util/AIResponseCodec')
const { ExtensionConfig } = require('../out/config/ExtensionConfig')
restoreModules()

let requestCount = 0
let requests = []
const sourceWithBackslash = String.raw`const pattern = \d+;`
const malformedGenerationReply = [
  '结果如下：',
  '```json',
  String.raw`{"bookmarks":[{"label":"Regex entry","lineNumber":1,"anchor":"const pattern = \d+;","children":[]}]}`,
  '```',
].join('\n')
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    requests.push(body)
    requestCount++
    if (requestCount === 1) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        choices: [{ message: { content: malformedGenerationReply } }],
      }))
      return
    }
    if (requestCount === 3) {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end('{"error":"invalid credentials"}')
      return
    }
    if (requestCount === 4) {
      response.writeHead(429, { 'Content-Type': 'application/json' })
      response.end('{"error":"rate limited"}')
      return
    }
    if (requestCount === 5) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{}')
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({
      choices: [{ message: { content: [{ type: 'text', text: '[{"id":"bookmark-1","new_label":"优化结构验证","icon":"validation"}]' }] } }],
    }))
  })
})

async function main() {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  Object.defineProperties(ExtensionConfig, {
    aiEndpoint: { configurable: true, get: () => `http://127.0.0.1:${address.port}/v1/chat/completions` },
    aiApiKey: { configurable: true, get: () => 'test-key' },
    aiModel: { configurable: true, get: () => 'test-model' },
    aiTimeoutS: { configurable: true, get: () => 10 },
    aiPrompt: { configurable: true, get: () => 'custom generation instruction' },
    aiOptimizePrompt: { configurable: true, get: () => 'custom optimization instruction' },
  })

  const generated = await AIService.generateBookmarks(sourceWithBackslash, 'sample.ts')
  assert.deepEqual(generated, [{
    label: 'Regex entry',
    line: 0,
    content: String.raw`const pattern = \d+;`,
    subs: [],
  }])
  assert.match(requests[0].messages[0].content, /custom generation instruction/)
  assert.match(requests[0].messages[0].content, /必须只输出一个 JSON 对象/)
  assert.match(requests[0].messages[0].content, /一个反斜杠必须输出为两个反斜杠/)
  assert.match(requests[0].messages[0].content, /匹配程度不高、存在歧义或无法可靠判断时不要输出 icon/)
  assert.match(requests[0].messages[0].content, /不匹配时使用默认图标/)
  assert.doesNotMatch(requests[0].messages[0].content, /无法可靠判断时使用 module/)
  assert.match(requests[0].messages[0].content, /entry：程序入口、启动、初始化/)
  assert.match(requests[0].messages[0].content, /URL、URI、域名及查询参数应选择 link/)
  assert.doesNotMatch(requests[0].messages[0].content, /module：/)

  const optimized = await AIService.optimizeBookmarks(sourceWithBackslash, 'sample.ts', [{
    id: 'bookmark-1',
    label: '现有标签',
    content: sourceWithBackslash,
    start: { line: 0 },
  }])
  assert.match(requests[1].messages[0].content, /custom optimization instruction/)
  assert.deepEqual(optimized, [{
    id: 'bookmark-1',
    new_label: '优化结构验证',
    iconName: 'status_test_green.svg',
  }])
  assert.match(requests[1].messages[0].content, /每项只能有 id、new_label、icon/)
  assert.match(requests[1].messages[0].content, /canAssignIcon=true 只表示允许选择图标/)
  assert.match(requests[1].messages[1].content, /"canAssignIcon":true/)
  await assert.rejects(AIService.sendRequest([{ role: 'user', content: 'hello' }]), error => {
    assert.equal(isAIAuthenticationError(error), true)
    assert.equal(isAIRateLimitError(error), false)
    return true
  })
  await assert.rejects(AIService.sendRequest([{ role: 'user', content: 'hello' }]), error => {
    assert.equal(isAIAuthenticationError(error), false)
    assert.equal(isAIRateLimitError(error), true)
    return true
  })
  await assert.rejects(AIService.testConnection(), /choices/)
  assert.equal(
    repairJsonStringEscapes(String.raw`{"value":"quoted \" text \\ slash \/ line \b \f \n \r \t \\u1234"}`),
    String.raw`{"value":"quoted \" text \\ slash \/ line \b \f \n \r \t \\u1234"}`
  )
  assert.equal(
    repairJsonStringEscapes(String.raw`{"value":"regex \d+ \w+ \\. \\("}`),
    String.raw`{"value":"regex \\d+ \\w+ \\. \\("}`
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  server.close()
})
