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

for (const source of [
  'component.mjs', 'component.cjs', 'component.mts', 'component.cts',
  'build.ps1', 'script.sh', 'query.sql', 'page.svelte', 'Dockerfile', 'Makefile',
]) {
  assert.equal(isAISourceFile(source), true, `Expected AI source file: ${source}`)
}
for (const generated of ['package-lock.json', 'image.svg', 'archive.zip', 'notes.txt']) {
  assert.equal(isAISourceFile(generated), false, `Unexpected AI source file: ${generated}`)
}
