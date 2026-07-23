const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { describe, it, before, after } = require('node:test')

const {
  MAX_BOOKMARK_NODES,
  parseBookmarkJSON,
} = require('../../out/models/BookmarkCodec')
const localization = require('../../out/i18n/Localization')

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'scripts', 'fixtures', 'bookmark-tree-contract.json'),
  'utf8',
))

describe('BookmarkCodec', () => {
  before(() => localization.initializeLocalization('en'))
  after(() => localization.initializeLocalization('zh-cn'))

  it('parses the persisted bookmark tree contract', () => {
    const parsed = parseBookmarkJSON(fixture)
    assert.equal(parsed.id, fixture.id)
    assert.equal(parsed.startLine, 2)
    assert.equal(parsed.endColumn, 8)
    assert.equal(parsed.subs[0].codeMarker.marker, 'TODO')
  })

  it('rejects invalid depth, node count, state, and positions', () => {
    assert.throws(() => parseBookmarkJSON(fixture, 65), /nesting exceeds/)
    assert.throws(
      () => parseBookmarkJSON(fixture, 0, { count: MAX_BOOKMARK_NODES - 1 }),
      /exceeds 10000 nodes/,
    )
    assert.throws(() => parseBookmarkJSON({ ...fixture, collapsibleState: 3 }), /collapsible state/)
    assert.throws(() => parseBookmarkJSON({ ...fixture, params: '1,0,0,0' }), /position range/)
  })

  it('normalizes unsafe icon paths instead of persisting traversal', () => {
    assert.equal(parseBookmarkJSON({ ...fixture, iconName: '../unsafe.svg' }).iconName, '')
  })
})
