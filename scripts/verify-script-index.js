const assert = require('node:assert/strict')
const path = require('node:path')
const { ScriptIndex } = require('../out/repository/ScriptIndex')

const storageRoot = path.resolve('storage')
const workspaceRoot = path.resolve('workspace')
const sourcePath = path.join(workspaceRoot, 'src', 'a.ts')
const sourcePathAlias = `${path.dirname(sourcePath)}${path.sep}.${path.sep}${path.basename(sourcePath)}`
const replacementPath = path.join(workspaceRoot, 'other.ts')

const index = new ScriptIndex()
const first = {
  id: 'script-a',
  filePath: path.join(storageRoot, 'scripts', 'script-a.json'),
  metadata: {
    id: 'script-a',
    path: sourcePath,
    fingerprint: { sha256: 'a'.repeat(64), size: 10 },
    lastSeenAt: 1,
  },
}
const duplicatePath = {
  id: 'script-b',
  filePath: path.join(storageRoot, 'scripts', 'script-b.json'),
  metadata: {
    id: 'script-b',
    path: sourcePathAlias,
    fingerprint: { sha256: 'b'.repeat(64), size: 11 },
    lastSeenAt: 2,
  },
}

assert.equal(index.isReady, false)
assert.equal(index.storageRootKey, undefined)
index.reset(storageRoot)
assert.equal(index.storageRootKey, storageRoot)
assert.equal(index.isReady, false)

index.set(first)
index.set(duplicatePath)
assert.equal(index.has('script-a'), true)
assert.equal(index.get('script-a'), first)
assert.deepEqual(index.byPath(sourcePath).map(entry => entry.id), ['script-a', 'script-b'])
assert.deepEqual(index.byFingerprint(first.metadata.fingerprint).map(entry => entry.id), ['script-a'])
assert.equal(index.values().length, 2)

const replacement = {
  ...first,
  filePath: path.join(storageRoot, 'scripts', 'script-a-new.json'),
  metadata: {
    ...first.metadata,
    path: replacementPath,
    fingerprint: { sha256: 'c'.repeat(64), size: 12 },
  },
}
index.set(replacement)
assert.equal(index.get('script-a'), replacement)
assert.deepEqual(index.byPath(sourcePath).map(entry => entry.id), ['script-b'])
assert.deepEqual(index.byFingerprint(first.metadata.fingerprint).map(entry => entry.id), [])
assert.deepEqual(index.byFingerprint(replacement.metadata.fingerprint).map(entry => entry.id), ['script-a'])

index.remove('script-b')
assert.equal(index.has('script-b'), false)
assert.deepEqual(index.byPath(sourcePath), [])
index.invalidate()
assert.equal(index.isReady, false)
index.markReady()
assert.equal(index.isReady, true)

const newStorageRoot = path.resolve('new-storage')
index.reset(newStorageRoot)
assert.equal(index.values().length, 0)
assert.equal(index.byPath(replacementPath).length, 0)
assert.equal(index.storageRootKey, newStorageRoot)
assert.equal(index.isReady, false)

console.log('ScriptIndex contract verified.')
