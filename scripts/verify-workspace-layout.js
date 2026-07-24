/**
 * 验证工作区布局只保存脚本与书签的稳定身份引用。
 * 解码器必须拒绝循环关系、悬空父节点和无法识别的持久化版本。
 */
const assert = require('node:assert/strict')
const {
  decodeWorkspaceLayoutPersistence,
  workspaceLayoutPersistence,
} = require('../out/models/WorkspaceLayout')

const scriptA = '10000000-0000-9000-1000-000000000011'
const scriptB = '10000000-0000-9000-1000-000000000012'
const fileA = { kind: 'script', scriptId: scriptA }
const fileB = { kind: 'script', scriptId: scriptB }
const value = workspaceLayoutPersistence([
  { node: fileA, parent: null },
  { node: fileB, parent: fileA },
], [scriptB], fileA, 1, [{ node: fileA, expanded: false }])
assert.deepEqual(decodeWorkspaceLayoutPersistence(value).layout.entries, value.entries)
assert.deepEqual(decodeWorkspaceLayoutPersistence(value).layout.expansionStates, value.expansionStates)
assert.equal(Object.hasOwn(value.entries[0], 'label'), false)
assert.throws(() => decodeWorkspaceLayoutPersistence({
  ...value,
  entries: [
    { node: fileA, parent: fileB },
    { node: fileB, parent: fileA },
  ],
}))

console.log('Workspace layout contract verified.')
