/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-json-record`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-json-record` 对应契约。
 * 核心边界：通过断言锁定“verify-json-record”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')

const { isJsonRecord } = require('../out/util/JsonRecord')

assert.equal(isJsonRecord({}), true)
assert.equal(isJsonRecord({ value: 1 }), true)
assert.equal(isJsonRecord(Object.create(null)), true)
assert.equal(isJsonRecord([]), false)
assert.equal(isJsonRecord(null), false)
assert.equal(isJsonRecord('value'), false)
assert.equal(isJsonRecord(1), false)
assert.equal(isJsonRecord(() => undefined), false)
