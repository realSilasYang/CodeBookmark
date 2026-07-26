/**
 * 验证序列化书签树的身份重写、路径替换、内容比较和无损合并。
 * 脚本直接调用编译后的 `SerializedBookmarkTree`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')

const {
  mergeSerializedBookmarks,
  mergeSerializedBookmarksWithIdMap,
  serializedBookmarkContentIdentity,
  renameSerializedBookmarkPaths,
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

const deduplicatedWithMap = mergeSerializedBookmarksWithIdMap(primary, duplicate, 'target.ts')
assert.equal(deduplicatedWithMap.idMap.get('bookmark-b'), 'bookmark-a')
assert.equal(deduplicatedWithMap.idMap.get('child-b'), 'child-a')

const mergedWithMap = mergeSerializedBookmarksWithIdMap(primary, conflict, 'target.ts')
const merged = mergedWithMap.bookmarks
assert.equal(merged.length, 2)
assert.equal(merged[1].id === 'bookmark-a', false)
assert.equal(merged[1].subs[0].id === 'child-a', false)
assert.equal(mergedWithMap.idMap.get('bookmark-a'), merged[1].id)
assert.equal(mergedWithMap.idMap.get('child-a'), merged[1].subs[0].id)
assert.equal(merged[1].path, 'target.ts')

const nestedOnlyConflict = [{
  id: 'bookmark-c',
  path: 'other.ts',
  label: 'nested conflict',
  subs: [{ id: 'child-a', path: 'other.ts', label: 'different child', subs: [] }],
}]
const nestedMerged = mergeSerializedBookmarksWithIdMap(primary, nestedOnlyConflict, 'target.ts')
assert.equal(nestedMerged.bookmarks.length, 2)
assert.notEqual(nestedMerged.bookmarks[1].id, 'bookmark-c')
assert.notEqual(nestedMerged.bookmarks[1].subs[0].id, 'child-a')
assert.equal(nestedMerged.idMap.get('bookmark-c'), nestedMerged.bookmarks[1].id)
assert.equal(nestedMerged.idMap.get('child-a'), nestedMerged.bookmarks[1].subs[0].id)
assert.equal(serializedBookmarkContentIdentity(primary[0]), serializedBookmarkContentIdentity(duplicate[0]))

const renamed = [{ path: 'src/folder/a.ts', subs: [null, { path: 'src/folder/a.ts', subs: ['invalid'] }] }, { path: 'src/other.ts' }, 42]
renameSerializedBookmarkPaths(renamed, 'src/folder', 'src/moved')
assert.equal(renamed[0].path, 'src/moved/a.ts')
assert.equal(renamed[0].subs[1].path, 'src/moved/a.ts')
assert.equal(renamed[1].path, 'src/other.ts')
assert.equal(JSON.stringify({ primary, duplicate, conflict }), original)
