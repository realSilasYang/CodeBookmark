const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

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
} = require('../../out/models/WorkspaceOrder')

describe('WorkspaceOrder', () => {
  it('parses only string entries', () => {
    assert.deepEqual(
      decodeWorkspaceOrderPersistence(['src/a.ts', 1, null, 'src/b.ts']).order,
      ['src/a.ts', 'src/b.ts'],
    )
    assert.throws(() => decodeWorkspaceOrderPersistence({}))
  })

  it('appends and locates canonical paths without duplicating them', () => {
    assert.deepEqual(appendWorkspaceOrderPath(['src/a.ts'], 'src/b.ts'), ['src/a.ts', 'src/b.ts'])
    assert.deepEqual(appendWorkspaceOrderPath(['src\\a.ts'], 'src/a.ts'), ['src\\a.ts'])
    assert.equal(workspaceOrderFileIndex(['src/a.ts', 'src/b.ts'], 'src\\b.ts'), 1)
  })

  it('removes files and directory trees without touching prefix lookalikes', () => {
    assert.deepEqual(removeWorkspaceOrderTree(
      ['src/feature/a.ts', 'src/feature/nested/b.ts', 'src/feature-two.ts'],
      'src/feature',
    ), { order: ['src/feature-two.ts'], changed: true })
    assert.deepEqual(removeWorkspaceOrderFile(['src/a.ts', 'src/a.ts'], 'src/a.ts'), {
      order: ['src/a.ts'],
      index: 0,
    })
  })

  it('inserts and renames files deterministically', () => {
    assert.deepEqual(insertWorkspaceOrderFile(['src/a.ts'], 'src/b.ts', 0), {
      order: ['src/b.ts', 'src/a.ts'],
      changed: true,
    })
    assert.deepEqual(renameWorkspaceOrderFile(
      ['src/a.ts', 'src/b.ts', 'src/a.ts'],
      'src/a.ts',
      'src/c.ts',
    ), { order: ['src/c.ts', 'src/b.ts', 'src/a.ts'], changed: true })
  })

  it('moves and merges directory entries without losing order', () => {
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
    assert.deepEqual(mergeWorkspaceOrder(['src/a.ts'], ['src/a.ts', 'src/b.ts']), ['src/a.ts', 'src/b.ts'])
  })
})
