/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-fingerprint-matching`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-fingerprint-matching` 对应契约。
 * 核心边界：通过断言锁定“verify-fingerprint-matching”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')

const { findBestFingerprintLine, getFingerprintContext } = require('../out/util/FingerprintMatcher')

const repeated = [
  'if (first) {',
  '  return value',
  '}',
  'if (second) {',
  '  return value',
  '}'
]
const repeatedContext = getFingerprintContext(repeated, 4, 'return value')
assert.equal(findBestFingerprintLine(repeated, 'return value', 1, repeatedContext), 4)

const emptyLines = [
  'section one',
  '',
  'value',
  'section two',
  '',
  'next'
]
const emptyContext = getFingerprintContext(emptyLines, 4, '')
assert.equal(emptyContext.before, 'section two')
assert.equal(findBestFingerprintLine(emptyLines, '', 1, emptyContext), 4)
