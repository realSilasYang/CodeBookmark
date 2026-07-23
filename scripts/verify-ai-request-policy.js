/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-request-policy`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-request-policy` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-request-policy”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')

const {
  isAISourceFile,
  isRemoteHttpEndpoint,
  normalizeAIRequestTimeoutSeconds,
} = require('../out/util/AIRequestPolicy')

assert.equal(normalizeAIRequestTimeoutSeconds(undefined), 60)
assert.equal(normalizeAIRequestTimeoutSeconds(30), 30)
assert.equal(normalizeAIRequestTimeoutSeconds(0), 1)
assert.equal(normalizeAIRequestTimeoutSeconds(9999999), 600)

assert.equal(isRemoteHttpEndpoint('http://example.com/v1/chat/completions'), true)
assert.equal(isRemoteHttpEndpoint('https://example.com/v1/chat/completions'), false)
assert.equal(isRemoteHttpEndpoint('http://localhost:11434/v1/chat/completions'), false)
assert.equal(isRemoteHttpEndpoint('http://127.0.0.1:8080/v1/chat/completions'), false)
assert.equal(isRemoteHttpEndpoint('http://0.0.0.0:11434/api/chat'), false)
assert.equal(isRemoteHttpEndpoint('http://[::1]:11434/api/chat'), false)
assert.equal(isRemoteHttpEndpoint('http://host.docker.internal:11434/api/chat'), false)
assert.equal(isRemoteHttpEndpoint('http://192.168.1.10:11434/api/chat'), true)

for (const source of [
  'component.mjs', 'component.cjs', 'component.mts', 'component.cts',
  'build.ps1', 'script.sh', 'query.sql', 'page.svelte', 'Dockerfile', 'Makefile',
]) {
  assert.equal(isAISourceFile(source), true, `Expected AI source file: ${source}`)
}
for (const generated of ['package-lock.json', 'image.svg', 'archive.zip', 'notes.txt']) {
  assert.equal(isAISourceFile(generated), false, `Unexpected AI source file: ${generated}`)
}
