/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-serialized-bookmark-tree`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-serialized-bookmark-tree` 对应契约。
 * 核心边界：通过断言锁定“verify-serialized-bookmark-tree”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
