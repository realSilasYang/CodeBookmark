const assert = require('node:assert/strict')
const {
  appendWorkspaceOrderPath,
  insertWorkspaceOrderFile,
  mergeWorkspaceOrder,
  moveWorkspaceOrderDirectory,
  decodeWorkspaceOrderPersistence,
  removeWorkspaceOrderFile,
  removeWorkspaceOrderTree,
  renameWorkspaceOrderDirectory,
  renameWorkspaceOrderFile,
  workspaceOrderFileIndex,
} = require('../out/models/WorkspaceOrder')

assert.deepEqual(decodeWorkspaceOrderPersistence(['src/a.ts', 1, null, 'src/b.ts']).order, ['src/a.ts', 'src/b.ts'])
assert.throws(() => decodeWorkspaceOrderPersistence({}))
assert.deepEqual(appendWorkspaceOrderPath(['src/a.ts'], 'src/b.ts'), ['src/a.ts', 'src/b.ts'])
assert.deepEqual(appendWorkspaceOrderPath(['src\\a.ts'], 'src/a.ts'), ['src\\a.ts'])

assert.deepEqual(removeWorkspaceOrderTree(
  ['src/feature/a.ts', 'src/feature/nested/b.ts', 'src/feature-two.ts'],
  'src/feature',
), { order: ['src/feature-two.ts'], changed: true })
assert.deepEqual(removeWorkspaceOrderTree(['src/a.ts'], 'other'), {
  order: ['src/a.ts'],
  changed: false,
})

assert.equal(workspaceOrderFileIndex(['src/a.ts', 'src/b.ts'], 'src\\b.ts'), 1)
assert.deepEqual(removeWorkspaceOrderFile(['src/a.ts', 'src/a.ts'], 'src/a.ts'), {
  order: ['src/a.ts'],
  index: 0,
})
assert.deepEqual(insertWorkspaceOrderFile(['src/a.ts'], 'src/b.ts', 0), {
  order: ['src/b.ts', 'src/a.ts'],
  changed: true,
})
assert.deepEqual(insertWorkspaceOrderFile(['src/a.ts'], 'src/a.ts', 0), {
  order: ['src/a.ts'],
  changed: false,
})

assert.deepEqual(renameWorkspaceOrderFile(
  ['src/a.ts', 'src/b.ts', 'src/a.ts'],
  'src/a.ts',
  'src/c.ts',
), { order: ['src/c.ts', 'src/b.ts', 'src/a.ts'], changed: true })
assert.deepEqual(renameWorkspaceOrderFile(['src/a.ts'], 'missing.ts', 'src/a.ts'), {
  order: ['src/a.ts'],
  changed: false,
})

assert.deepEqual(renameWorkspaceOrderDirectory(
  ['src/old/a.ts', 'src/old/nested/b.ts', 'src/other.ts'],
  'src/old',
  'src/new',
), ['src/new/a.ts', 'src/new/nested/b.ts', 'src/other.ts'])
assert.deepEqual(moveWorkspaceOrderDirectory(
  ['src/old/a.ts', 'src/other.ts', 'src/old/b.ts'],
  'src/old',
  'src/new',
), {
  remaining: ['src/other.ts'],
  moved: ['src/new/a.ts', 'src/new/b.ts'],
})
assert.deepEqual(mergeWorkspaceOrder(['src/a.ts', 'src\\a.ts'], ['src/a.ts', 'src/b.ts']), [
  'src/a.ts',
  'src\\a.ts',
  'src/b.ts',
])

console.log('WorkspaceOrder contract verified.')
