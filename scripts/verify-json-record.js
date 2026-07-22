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
