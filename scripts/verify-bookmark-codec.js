const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  MAX_BOOKMARK_NODES,
  parseBookmarkJSON,
} = require('../out/models/BookmarkCodec')

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'bookmark-tree-contract.json'),
  'utf8',
))
const parsed = parseBookmarkJSON(fixture)

assert.equal(parsed.id, fixture.id)
assert.equal(parsed.collapsibleState, fixture.collapsibleState)
assert.equal(parsed.startLine, 2)
assert.equal(parsed.endColumn, 8)
assert.equal(parsed.subs[0].codeMarker.marker, 'TODO')
assert.equal(parsed.subs[0].iconName, 'status_idea_yellow.svg')

assert.throws(() => parseBookmarkJSON(fixture, 65), /nesting exceeds/)
assert.throws(
  () => parseBookmarkJSON(fixture, 0, { count: MAX_BOOKMARK_NODES - 1 }),
  /exceeds 10000 nodes/,
)
assert.throws(() => parseBookmarkJSON({ ...fixture, collapsibleState: 3 }), /collapsible state/)
assert.throws(() => parseBookmarkJSON({ ...fixture, params: '1,0,0,0' }), /position range/)

const sanitizedIcon = parseBookmarkJSON({ ...fixture, iconName: '../unsafe.svg' })
assert.equal(sanitizedIcon.iconName, '')
