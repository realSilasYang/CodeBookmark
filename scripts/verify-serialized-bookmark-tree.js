const assert = require('node:assert/strict')

const {
  mergeSerializedBookmarks,
  serializedBookmarkContentIdentity,
} = require('../out/models/SerializedBookmarkTree')

const primary = [{
  id: 'bookmark-a',
  path: 'old.ts',
  label: 'same',
  subs: [{ id: 'child-a', path: 'old.ts', label: 'child', subs: [] }],
}]
const duplicate = [{
  id: 'bookmark-b',
  path: 'new.ts',
  label: 'same',
  subs: [{ id: 'child-b', path: 'new.ts', label: 'child', subs: [] }],
}]
const conflict = [{
  id: 'bookmark-a',
  path: 'other.ts',
  label: 'changed',
  subs: [{ id: 'child-a', path: 'other.ts', label: 'child changed', subs: [] }],
}]
const original = JSON.stringify({ primary, duplicate, conflict })

const deduplicated = mergeSerializedBookmarks(primary, duplicate, 'target.ts')
assert.equal(deduplicated.length, 1)
assert.equal(deduplicated[0].path, 'target.ts')
assert.equal(deduplicated[0].subs[0].path, 'target.ts')

const merged = mergeSerializedBookmarks(primary, conflict, 'target.ts')
assert.equal(merged.length, 2)
assert.equal(merged[1].id === 'bookmark-a', false)
assert.equal(merged[1].subs[0].id === 'child-a', false)
assert.equal(merged[1].path, 'target.ts')
assert.equal(serializedBookmarkContentIdentity(primary[0]), serializedBookmarkContentIdentity(duplicate[0]))
assert.equal(JSON.stringify({ primary, duplicate, conflict }), original)
