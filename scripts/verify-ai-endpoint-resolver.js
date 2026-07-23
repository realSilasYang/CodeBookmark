const assert = require('node:assert/strict')

const { resolveAIRequestTargets } = require('../out/util/AIEndpointResolver')

const summary = (address, model = 'test-model') => resolveAIRequestTargets(address, model)
  .map(target => `${target.protocol} ${target.url.toString()} ${target.inference}`)

assert.deepEqual(summary('api.openai.com'), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions normalized',
  'openai-responses https://api.openai.com/v1/responses fallback',
])
assert.deepEqual(summary('https://api.openai.com/v1/'), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions normalized',
  'openai-responses https://api.openai.com/v1/responses fallback',
])
assert.deepEqual(summary('https://api.openai.com/v1/chat/completions'), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions explicit',
])
assert.deepEqual(summary('https://api.openai.com/v1/responses'), [
  'openai-responses https://api.openai.com/v1/responses explicit',
])
assert.deepEqual(summary('https://api.openai.com/v1/chat/completions/?trace=1#ignored'), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions?trace=1 explicit',
])
assert.deepEqual(summary('https://api.openai.com/v1/chat'), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions normalized',
])
assert.deepEqual(summary('https://api.openai.com/v1/chat/completion'), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions normalized',
])
assert.deepEqual(summary('https://api.openai.com/v1/completions'), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions normalized',
])
assert.deepEqual(summary('https://api.openai.com/v1/response'), [
  'openai-responses https://api.openai.com/v1/responses normalized',
])
assert.deepEqual(summary('https://api.openai.com/custom/v2'), [
  'openai-chat-completions https://api.openai.com/custom/v2/chat/completions normalized',
  'openai-responses https://api.openai.com/custom/v2/responses fallback',
])

for (const hostname of [
  'demo.openai.azure.com',
  'demo.services.ai.azure.com',
  'demo.openai.azure.us',
  'demo.openai.azure.cn',
]) {
  assert.deepEqual(summary(`https://${hostname}`), [
    `openai-responses https://${hostname}/openai/v1/responses normalized`,
    `openai-chat-completions https://${hostname}/openai/v1/chat/completions fallback`,
  ])
}
assert.deepEqual(summary('https://demo.openai.azure.com/openai/v1/?trace=1'), [
  'openai-responses https://demo.openai.azure.com/openai/v1/responses?trace=1 normalized',
  'openai-chat-completions https://demo.openai.azure.com/openai/v1/chat/completions?trace=1 fallback',
])
assert.deepEqual(summary('https://demo.openai.azure.com/openai/deployments/deployment?api-version=2024-10-21'), [
  'openai-chat-completions https://demo.openai.azure.com/openai/deployments/deployment/chat/completions?api-version=2024-10-21 normalized',
])
assert.deepEqual(summary('https://demo.openai.azure.com/openai/deployments/deployment/chat?api-version=2024-10-21'), [
  'openai-chat-completions https://demo.openai.azure.com/openai/deployments/deployment/chat/completions?api-version=2024-10-21 normalized',
])

assert.deepEqual(summary('https://openrouter.ai'), [
  'openai-chat-completions https://openrouter.ai/api/v1/chat/completions normalized',
  'openai-responses https://openrouter.ai/api/v1/responses fallback',
])
for (const [hostname, basePath] of [
  ['api.groq.com', '/openai/v1'],
  ['api.mistral.ai', '/v1'],
  ['api.x.ai', '/v1'],
  ['api.together.xyz', '/v1'],
  ['api.siliconflow.cn', '/v1'],
  ['api.moonshot.cn', '/v1'],
  ['api.cerebras.ai', '/v1'],
  ['integrate.api.nvidia.com', '/v1'],
  ['api.fireworks.ai', '/inference/v1'],
  ['dashscope.aliyuncs.com', '/compatible-mode/v1'],
]) {
  assert.deepEqual(summary(`https://${hostname}`), [
    `openai-chat-completions https://${hostname}${basePath}/chat/completions normalized`,
    `openai-responses https://${hostname}${basePath}/responses fallback`,
  ])
}
assert.deepEqual(summary('https://api.deepseek.com'), [
  'openai-chat-completions https://api.deepseek.com/chat/completions normalized',
  'openai-chat-completions https://api.deepseek.com/v1/chat/completions fallback',
  'openai-responses https://api.deepseek.com/responses fallback',
  'openai-responses https://api.deepseek.com/v1/responses fallback',
])

assert.deepEqual(summary('https://api.anthropic.com'), [
  'anthropic-messages https://api.anthropic.com/v1/messages normalized',
])
assert.deepEqual(summary('https://api.anthropic.com/v1/messages/?tenant=one'), [
  'anthropic-messages https://api.anthropic.com/v1/messages?tenant=one explicit',
])
assert.deepEqual(summary('https://api.anthropic.com/v1/message'), [
  'anthropic-messages https://api.anthropic.com/v1/messages normalized',
])
assert.deepEqual(summary('https://proxy.example/anthropic/v1/messages'), [
  'anthropic-messages https://proxy.example/anthropic/v1/messages explicit',
])

assert.deepEqual(summary('https://generativelanguage.googleapis.com', 'models/gemini-2.5-pro'), [
  'gemini-generate-content https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent normalized',
])
assert.deepEqual(summary('https://generativelanguage.googleapis.com/v1beta'), [
  'gemini-generate-content https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent normalized',
])
assert.deepEqual(summary('https://generativelanguage.googleapis.com/v1beta/models/old:streamGenerateContent?alt=json'), [
  'gemini-generate-content https://generativelanguage.googleapis.com/v1beta/models/old:generateContent?alt=json normalized',
])
assert.deepEqual(summary('https://generativelanguage.googleapis.com/v1beta/openai'), [
  'openai-chat-completions https://generativelanguage.googleapis.com/v1beta/openai/chat/completions normalized',
  'openai-responses https://generativelanguage.googleapis.com/v1beta/openai/responses fallback',
])
assert.deepEqual(summary('https://generativelanguage.googleapis.com/v1beta/openai/chat'), [
  'openai-chat-completions https://generativelanguage.googleapis.com/v1beta/openai/chat/completions normalized',
])
assert.deepEqual(summary('https://generativelanguage.googleapis.com/v1beta/openai/chat/?key=query-key#ignored'), [
  'openai-chat-completions https://generativelanguage.googleapis.com/v1beta/openai/chat/completions?key=query-key normalized',
])
assert.deepEqual(summary('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro'), [
  'gemini-generate-content https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent normalized',
])
assert.deepEqual(summary('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro/generateContent'), [
  'gemini-generate-content https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent normalized',
])
assert.deepEqual(summary('https://us-central1-aiplatform.googleapis.com/v1/projects/project/locations/us-central1/publishers/google/models', 'gemini-2.5-pro'), [
  'gemini-generate-content https://us-central1-aiplatform.googleapis.com/v1/projects/project/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent normalized',
])
assert.deepEqual(summary('https://us-central1-aiplatform.googleapis.com/v1/projects/project/locations/us-central1/publishers/google/models/gemini-2.5-pro'), [
  'gemini-generate-content https://us-central1-aiplatform.googleapis.com/v1/projects/project/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent normalized',
])

assert.deepEqual(summary('localhost:11434', 'qwen3'), [
  'ollama-chat http://localhost:11434/api/chat normalized',
])
assert.deepEqual(summary('0.0.0.0:11434', 'qwen3'), [
  'ollama-chat http://0.0.0.0:11434/api/chat normalized',
])
assert.deepEqual(summary('host.docker.internal:11434', 'qwen3'), [
  'ollama-chat http://host.docker.internal:11434/api/chat normalized',
])
assert.deepEqual(summary('http://127.0.0.1:11434/api/chat', 'qwen3'), [
  'ollama-chat http://127.0.0.1:11434/api/chat explicit',
])
assert.deepEqual(summary('http://127.0.0.1:11434/chat', 'qwen3'), [
  'ollama-chat http://127.0.0.1:11434/api/chat normalized',
])
assert.deepEqual(summary('http://127.0.0.1:11434/api/generate', 'qwen3'), [
  'ollama-chat http://127.0.0.1:11434/api/chat normalized',
])
assert.deepEqual(summary('https://my-ollama.example/api', 'qwen3'), [
  'ollama-chat https://my-ollama.example/api/chat normalized',
])
assert.deepEqual(summary('http://127.0.0.1:11434/v1', 'qwen3'), [
  'openai-chat-completions http://127.0.0.1:11434/v1/chat/completions normalized',
  'openai-responses http://127.0.0.1:11434/v1/responses fallback',
])
assert.deepEqual(summary('127.0.0.1:1234/v1', 'local-model'), [
  'openai-chat-completions http://127.0.0.1:1234/v1/chat/completions normalized',
  'openai-responses http://127.0.0.1:1234/v1/responses fallback',
])

assert.deepEqual(summary('https://gateway.example/custom/base?tenant=one#docs'), [
  'openai-chat-completions https://gateway.example/custom/base/chat/completions?tenant=one normalized',
  'openai-chat-completions https://gateway.example/custom/base/v1/chat/completions?tenant=one fallback',
  'openai-responses https://gateway.example/custom/base/responses?tenant=one fallback',
  'openai-responses https://gateway.example/custom/base/v1/responses?tenant=one fallback',
])
assert.deepEqual(summary('https://gateway.example/v1/chat/chat/completions'), [
  'openai-chat-completions https://gateway.example/v1/chat/completions explicit',
])
assert.deepEqual(summary('https://gateway.example/v1/chat/completions/chat/completions'), [
  'openai-chat-completions https://gateway.example/v1/chat/completions explicit',
])
assert.deepEqual(summary('https://gateway.example/v1/responses/responses'), [
  'openai-responses https://gateway.example/v1/responses explicit',
])
assert.deepEqual(summary('https://gateway.example/v1/chat'), [
  'openai-chat-completions https://gateway.example/v1/chat/completions normalized',
])
assert.deepEqual(summary('  //API.OPENAI.COM//v1//chat//  '), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions normalized',
])
assert.deepEqual(summary('`https://api.openai.com/v1`'), [
  'openai-chat-completions https://api.openai.com/v1/chat/completions normalized',
  'openai-responses https://api.openai.com/v1/responses fallback',
])
assert.deepEqual(summary('<https://api.openai.com/v1/responses>'), [
  'openai-responses https://api.openai.com/v1/responses explicit',
])
for (const target of resolveAIRequestTargets('https://same-origin.example', 'model')) {
  assert.equal(target.url.origin, 'https://same-origin.example')
}

for (const address of [
  'https://api.openai.com',
  'https://demo.openai.azure.com/openai/v1/',
  'https://api.anthropic.com',
  'https://generativelanguage.googleapis.com/v1beta',
  'https://generativelanguage.googleapis.com/v1beta/openai/chat',
  'https://us-central1-aiplatform.googleapis.com/v1/projects/project/locations/us-central1/publishers/google/models/gemini-2.5-pro',
  'http://127.0.0.1:11434',
  'https://gateway.example/custom/base?tenant=one',
]) {
  const targets = resolveAIRequestTargets(address, 'gemini-2.5-pro')
  assert.equal(new Set(targets.map(target => `${target.protocol}\n${target.url}`)).size, targets.length)
  for (const target of targets) {
    const secondPass = resolveAIRequestTargets(target.url.toString(), 'gemini-2.5-pro')
    assert.deepEqual(
      secondPass.map(item => `${item.protocol} ${item.url}`),
      [`${target.protocol} ${target.url}`],
      `normalization must be idempotent for ${target.url}`,
    )
  }
}

assert.throws(() => resolveAIRequestTargets('', 'model'), /未配置/)
assert.throws(() => resolveAIRequestTargets('ftp://example.com/v1', 'model'), /http:\/\/ 或 https:\/\//)
assert.throws(() => resolveAIRequestTargets('https://user:secret@example.com/v1', 'model'), /用户名或密码/)
assert.throws(() => resolveAIRequestTargets('https://generativelanguage.googleapis.com', ''), /模型名称/)

console.log('AI endpoint resolver contract verified.')
