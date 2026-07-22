const assert = require('node:assert/strict')
const { PendingSaveStore } = require('../out/providers/PendingSaveStore')

const firstSnapshot = [{ id: 'first' }]
const secondSnapshot = [{ id: 'second' }]
const store = new PendingSaveStore()

store.queue(['a.ts', 'b.ts'], firstSnapshot, 'storage-a', ['a.ts', 'b.ts'])
store.queue(['a.ts'], secondSnapshot, 'storage-a', ['a.ts', 'c.ts'])
let snapshot = store.takeSnapshot()
assert.equal(store.size, 0)
assert.deepEqual(snapshot.get('a.ts'), {
  bookmarks: secondSnapshot,
  attempts: 0,
  sequence: 3,
  storageRoot: 'storage-a',
  dirtyPaths: ['a.ts', 'b.ts', 'c.ts'],
})
assert.deepEqual(snapshot.get('b.ts'), {
  bookmarks: firstSnapshot,
  attempts: 0,
  sequence: 2,
  storageRoot: 'storage-a',
  dirtyPaths: ['a.ts', 'b.ts'],
})

store.queue(['a.ts'], secondSnapshot, 'storage-a', ['a.ts'])
store.queue(['a.ts'], firstSnapshot, 'storage-a')
snapshot = store.takeSnapshot()
assert.equal(snapshot.get('a.ts').dirtyPaths, undefined)

store.queue(['a.ts'], firstSnapshot, 'storage-a')
const failedSnapshot = store.takeSnapshot()
let result = store.requeueFailed(failedSnapshot, ['a.ts'], 3)
assert.deepEqual(result, { retried: true, exhausted: false })
let retry = store.takeSnapshot().get('a.ts')
assert.equal(retry.attempts, 1)
result = store.requeueFailed(new Map([['a.ts', retry]]), ['a.ts'], 3)
assert.deepEqual(result, { retried: true, exhausted: false })
retry = store.takeSnapshot().get('a.ts')
assert.equal(retry.attempts, 2)
result = store.requeueFailed(new Map([['a.ts', retry]]), ['a.ts'], 3)
assert.deepEqual(result, { retried: false, exhausted: true })
assert.equal(store.size, 0)

store.queue(['a.ts'], firstSnapshot, 'storage-a')
const activeRequest = store.takeSnapshot()
store.queue(['a.ts'], secondSnapshot, 'storage-a')
result = store.requeueFailed(activeRequest, ['a.ts'], 3)
assert.deepEqual(result, { retried: false, exhausted: false })
assert.equal(store.takeSnapshot().get('a.ts').bookmarks, secondSnapshot)

store.queue(['a.ts'], firstSnapshot, 'storage-a')
store.rebase(secondSnapshot)
assert.equal(store.takeSnapshot().get('a.ts').bookmarks, secondSnapshot)

console.log('PendingSaveStore contract verified.')
