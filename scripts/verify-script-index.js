const assert = require('node:assert/strict')
const { ScriptIndex } = require('../out/repository/ScriptIndex')

const index = new ScriptIndex()
const first = {
  id: 'script-a',
  filePath: 'C:\\storage\\scripts\\script-a.json',
  metadata: {
    id: 'script-a',
    path: 'C:\\Workspace\\src\\a.ts',
    fingerprint: { sha256: 'a'.repeat(64), size: 10 },
    lastSeenAt: 1,
  },
}
const duplicatePath = {
  id: 'script-b',
  filePath: 'C:\\storage\\scripts\\script-b.json',
  metadata: {
    id: 'script-b',
    path: 'C:/Workspace/src/a.ts',
    fingerprint: { sha256: 'b'.repeat(64), size: 11 },
    lastSeenAt: 2,
  },
}

assert.equal(index.isReady, false)
assert.equal(index.storageRootKey, undefined)
index.reset('c:\\storage')
assert.equal(index.storageRootKey, 'c:\\storage')
assert.equal(index.isReady, false)

index.set(first)
index.set(duplicatePath)
assert.equal(index.has('script-a'), true)
assert.equal(index.get('script-a'), first)
assert.deepEqual(index.byPath('C:\\Workspace\\src\\a.ts').map(entry => entry.id), ['script-a', 'script-b'])
assert.deepEqual(index.byFingerprint(first.metadata.fingerprint).map(entry => entry.id), ['script-a'])
assert.equal(index.values().length, 2)

const replacement = {
  ...first,
  filePath: 'C:\\storage\\scripts\\script-a-new.json',
  metadata: {
    ...first.metadata,
    path: 'C:\\Workspace\\other.ts',
    fingerprint: { sha256: 'c'.repeat(64), size: 12 },
  },
}
index.set(replacement)
assert.equal(index.get('script-a'), replacement)
assert.deepEqual(index.byPath('C:\\Workspace\\src\\a.ts').map(entry => entry.id), ['script-b'])
assert.deepEqual(index.byFingerprint(first.metadata.fingerprint).map(entry => entry.id), [])
assert.deepEqual(index.byFingerprint(replacement.metadata.fingerprint).map(entry => entry.id), ['script-a'])

index.remove('script-b')
assert.equal(index.has('script-b'), false)
assert.deepEqual(index.byPath('C:\\Workspace\\src\\a.ts'), [])
index.invalidate()
assert.equal(index.isReady, false)
index.markReady()
assert.equal(index.isReady, true)

index.reset('C:\\new-storage')
assert.equal(index.values().length, 0)
assert.equal(index.byPath('C:\\Workspace\\other.ts').length, 0)
assert.equal(index.storageRootKey, 'C:\\new-storage')
assert.equal(index.isReady, false)

console.log('ScriptIndex contract verified.')
