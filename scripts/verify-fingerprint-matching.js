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
