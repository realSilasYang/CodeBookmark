/**
 * 检查普通 JSON 对象判断正确排除 null、数组和原始值。
 * 脚本直接调用编译后的 `JsonRecord`，只在 VS Code 或文件系统边界使用最小替身。
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
