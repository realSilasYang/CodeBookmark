/**
 * 覆盖模型文本提取、Markdown 围栏清理、有限 JSON 转义修复和错误预览截断。
 * 脚本直接调用编译后的 `AIResponseCodec`、`Localization`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')

const {
  aiErrorPreview,
  aiResponseContent,
  parseAIJsonReply,
  repairJsonStringEscapes,
  stripMarkdownCodeFence,
} = require('../out/util/AIResponseCodec')
const localization = require('../out/i18n/Localization')

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
localization.initializeLocalization('en')
assert.throws(() => parseAIJsonReply('', '{'), /content is empty/)
localization.initializeLocalization('zh-cn')
assert.throws(() => parseAIJsonReply('', '{'), /AI 响应内容为空/)

assert.equal(
  repairJsonStringEscapes(String.raw`{"value":"regex \d+ \w+"}`),
  String.raw`{"value":"regex \\d+ \\w+"}`,
)
assert.equal(aiErrorPreview(` bad\u0000value `), 'bad value')
assert.equal(aiErrorPreview('x'.repeat(5000)).length, 4001)
