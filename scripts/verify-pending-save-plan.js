/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-pending-save-plan`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-pending-save-plan` 对应契约。
 * 核心边界：通过断言锁定“verify-pending-save-plan”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { planPendingSaves } = require('../out/providers/PendingSavePlan')

const bookmarks = [{ id: 'bookmark' }]
const request = (sequence, storageRoot, dirtyPaths) => ({
  bookmarks,
  attempts: 0,
  sequence,
  storageRoot,
  dirtyPaths,
})
const requests = new Map([
  ['workspace-a/one.ts', request(1, 'storage-a', ['one.ts'])],
  ['workspace-a/two.ts', request(2, 'storage-a', ['two.ts', 'shared.ts'])],
  ['workspace-b/three.ts', request(3, 'storage-a', undefined)],
  ['workspace-a/four.ts', request(4, 'storage-b', ['four.ts'])],
  ['standalone.ts', request(5, 'storage-a', ['standalone.ts'])],
])

const plan = planPendingSaves(requests, filePath => {
  if (filePath.startsWith('workspace-a/')) return 'workspace-a'
  if (filePath.startsWith('workspace-b/')) return 'workspace-b'
  return undefined
})

assert.equal(plan.workspaceGroups.length, 3)
const workspaceA = plan.workspaceGroups.find(group => group.keys.includes('workspace-a/one.ts'))
assert.ok(workspaceA)
assert.equal(workspaceA.path, 'workspace-a/two.ts')
assert.equal(workspaceA.request.sequence, 2)
assert.deepEqual(workspaceA.keys, ['workspace-a/one.ts', 'workspace-a/two.ts'])
assert.deepEqual(workspaceA.dirtyPaths, ['one.ts', 'two.ts', 'shared.ts'])

const workspaceB = plan.workspaceGroups.find(group => group.keys.includes('workspace-b/three.ts'))
assert.ok(workspaceB)
assert.equal(workspaceB.dirtyPaths, undefined)

const storageB = plan.workspaceGroups.find(group => group.keys.includes('workspace-a/four.ts'))
assert.ok(storageB)
assert.equal(storageB.request.storageRoot, 'storage-b')
assert.deepEqual(plan.standaloneRequests.map(([filePath]) => filePath), ['standalone.ts'])

console.log('PendingSavePlan contract verified.')
