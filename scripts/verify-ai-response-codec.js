const assert = require('node:assert/strict')

const {
  aiErrorPreview,
  aiResponseContent,
  parseAIJsonReply,
  repairJsonStringEscapes,
  stripMarkdownCodeFence,
} = require('../out/util/AIResponseCodec')

assert.equal(aiResponseContent('plain'), 'plain')
assert.equal(aiResponseContent({ text: 'object' }), 'object')
assert.equal(aiResponseContent(['first', { type: 'text', text: 'second' }, { ignored: true }]), 'firstsecond')
assert.equal(aiResponseContent({ text: 1 }), '')

assert.equal(stripMarkdownCodeFence('```json\n{"value":1}\n```'), '{"value":1}')
assert.deepEqual(parseAIJsonReply('result: {"value":1} done', '{'), { value: 1 })
assert.deepEqual(parseAIJsonReply('\uFEFF[{"id":"a"}]', '['), [{ id: 'a' }])
assert.deepEqual(
  parseAIJsonReply(String.raw`{"value":"regex \d+"}`, '{'),
  { value: String.raw`regex \d+` },
)
assert.throws(() => parseAIJsonReply('', '{'), /content is empty/)

assert.equal(
  repairJsonStringEscapes(String.raw`{"value":"regex \d+ \w+"}`),
  String.raw`{"value":"regex \\d+ \\w+"}`,
)
assert.equal(aiErrorPreview(` bad\u0000value `), 'bad value')
assert.equal(aiErrorPreview('x'.repeat(5000)).length, 4001)
