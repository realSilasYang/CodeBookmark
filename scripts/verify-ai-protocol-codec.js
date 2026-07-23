/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-protocol-codec`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-protocol-codec` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-protocol-codec”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')

const {
  encodeAIProtocolRequest,
  decodeAIProtocolResponse,
} = require('../out/util/AIProtocolCodec')

const target = (protocol, url) => ({ protocol, url: new URL(url), inference: 'explicit' })
const messages = [
  { role: 'system', content: 'Return JSON.' },
  { role: 'user', content: 'Analyze this file.' },
]

const chat = encodeAIProtocolRequest(
  target('openai-chat-completions', 'https://api.openai.com/v1/chat/completions'),
  messages,
  'gpt-test',
  'secret',
)
assert.equal(chat.headers.Authorization, 'Bearer secret')
assert.deepEqual(JSON.parse(chat.payload), { model: 'gpt-test', messages })
const geminiOpenAI = encodeAIProtocolRequest(
  target('openai-chat-completions', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'),
  messages,
  'gemini-flash-latest',
  'gemini-key',
)
assert.equal(geminiOpenAI.headers.Authorization, 'Bearer gemini-key')
assert.equal(geminiOpenAI.headers['x-goog-api-key'], undefined)
assert.deepEqual(JSON.parse(geminiOpenAI.payload), {
  model: 'gemini-flash-latest',
  messages,
})
assert.equal(
  decodeAIProtocolResponse('openai-chat-completions', {
    choices: [{ message: { content: [{ type: 'text', text: 'chat result' }] } }],
  }),
  'chat result',
)

const responses = encodeAIProtocolRequest(
  target('openai-responses', 'https://api.openai.com/v1/responses'),
  messages,
  'gpt-test',
  'secret',
)
assert.deepEqual(JSON.parse(responses.payload), {
  model: 'gpt-test',
  input: messages,
  store: false,
})
assert.equal(
  decodeAIProtocolResponse('openai-responses', {
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'response result' }] }],
  }),
  'response result',
)
assert.equal(decodeAIProtocolResponse('openai-responses', { output_text: 'direct helper text' }), 'direct helper text')

const azure = encodeAIProtocolRequest(
  target('openai-chat-completions', 'https://demo.openai.azure.com/openai/v1/chat/completions'),
  messages,
  'deployment-name',
  'azure-key',
)
assert.equal(azure.headers['api-key'], 'azure-key')
assert.equal(azure.headers.Authorization, undefined)
const sovereignAzure = encodeAIProtocolRequest(
  target('openai-responses', 'https://demo.openai.azure.us/openai/v1/responses'),
  messages,
  'deployment-name',
  'azure-key',
)
assert.equal(sovereignAzure.headers['api-key'], 'azure-key')
assert.equal(sovereignAzure.headers.Authorization, undefined)
const legacyAzure = encodeAIProtocolRequest(
  target('openai-chat-completions', 'https://demo.openai.azure.com/openai/deployments/legacy/chat/completions?api-version=2024-10-21'),
  messages,
  'legacy',
  'azure-key',
)
assert.deepEqual(JSON.parse(legacyAzure.payload), { messages })

const anthropic = encodeAIProtocolRequest(
  target('anthropic-messages', 'https://api.anthropic.com/v1/messages'),
  messages,
  'claude-test',
  'anthropic-key',
)
assert.equal(anthropic.headers['x-api-key'], 'anthropic-key')
assert.equal(anthropic.headers['anthropic-version'], '2023-06-01')
assert.deepEqual(JSON.parse(anthropic.payload), {
  model: 'claude-test',
  max_tokens: 8192,
  system: 'Return JSON.',
  messages: [{ role: 'user', content: 'Analyze this file.' }],
})
assert.equal(
  decodeAIProtocolResponse('anthropic-messages', {
    content: [{ type: 'text', text: 'Claude ' }, { type: 'text', text: 'result' }],
  }),
  'Claude result',
)
const keylessAnthropic = encodeAIProtocolRequest(
  target('anthropic-messages', 'http://localhost:9000/v1/messages'),
  messages,
  'local-claude',
  '',
)
assert.equal(keylessAnthropic.headers['anthropic-version'], '2023-06-01')
assert.equal(keylessAnthropic.headers['x-api-key'], undefined)

const gemini = encodeAIProtocolRequest(
  target('gemini-generate-content', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent'),
  messages,
  'gemini-test',
  'gemini-key',
)
assert.equal(gemini.headers['x-goog-api-key'], 'gemini-key')
assert.deepEqual(JSON.parse(gemini.payload), {
  systemInstruction: { parts: [{ text: 'Return JSON.' }] },
  contents: [{ role: 'user', parts: [{ text: 'Analyze this file.' }] }],
})
assert.equal(
  decodeAIProtocolResponse('gemini-generate-content', {
    candidates: [{ content: { parts: [{ text: 'Gemini result' }] } }],
  }),
  'Gemini result',
)
const vertex = encodeAIProtocolRequest(
  target('gemini-generate-content', 'https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/l/publishers/google/models/gemini:generateContent'),
  messages,
  'gemini',
  'oauth-token',
)
assert.equal(vertex.headers.Authorization, 'Bearer oauth-token')

const ollama = encodeAIProtocolRequest(
  target('ollama-chat', 'http://localhost:11434/api/chat'),
  messages,
  'qwen3',
  '',
)
assert.equal(ollama.headers.Authorization, undefined)
assert.deepEqual(JSON.parse(ollama.payload), { model: 'qwen3', messages, stream: false })
assert.equal(
  decodeAIProtocolResponse('ollama-chat', { message: { role: 'assistant', content: 'Ollama result' } }),
  'Ollama result',
)

for (const protocol of [
  'openai-chat-completions',
  'openai-responses',
  'anthropic-messages',
  'gemini-generate-content',
  'ollama-chat',
]) {
  assert.equal(decodeAIProtocolResponse(protocol, {}), '')
}

console.log('AI protocol codec contract verified.')
