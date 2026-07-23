/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-response-codec`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-response-codec` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-response-codec”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
