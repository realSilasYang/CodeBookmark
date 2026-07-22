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
