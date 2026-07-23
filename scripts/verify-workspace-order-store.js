const assert = require('node:assert/strict')
const path = require('node:path')
const { WorkspaceOrderStore } = require('../out/repository/WorkspaceOrderStore')

const orderPath = folder => path.join(folder, '_workspace_order.json')
const persistedOrder = (files, folder) => {
  const value = files.get(orderPath(folder))
  assert.equal(value?.format, 'codebookmark.workspace-order')
  assert.equal(value?.schemaVersion, 1)
  return value?.order
}

function createHarness() {
  const files = new Map()
  const writes = []
  const deletes = []
  let writeSucceeds = true
  const store = new WorkspaceOrderStore({
    exists: async filePath => files.has(filePath),
    readJson: async filePath => files.get(filePath),
    writeJson: async (filePath, value) => {
      writes.push({ filePath, value: structuredClone(value) })
      if (writeSucceeds) files.set(filePath, structuredClone(value))
      return writeSucceeds
    },
    deleteFile: async filePath => {
      deletes.push(filePath)
      files.delete(filePath)
    },
  })
  return {
    files,
    writes,
    deletes,
    store,
    failWrites: () => { writeSucceeds = false },
  }
}

async function main() {
  const root = path.resolve('workspace-order-store')
  const scope = path.join(root, 'scopes', 'scope')
  const targetScope = path.join(root, 'scopes', 'target')
  let harness = createHarness()

  await harness.store.append(scope, 'src/a.ts')
  await harness.store.append(scope, 'src\\a.ts')
  assert.deepEqual(persistedOrder(harness.files, scope), ['src/a.ts'])
  assert.equal(harness.writes.length, 2)
  assert.equal(await harness.store.indexOf(scope, 'src\\a.ts'), 0)
  assert.equal(await harness.store.indexOf(targetScope, 'src/a.ts'), undefined)

  harness.files.set(orderPath(scope), ['src/feature/a.ts', 'src/other.ts'])
  await harness.store.removeTree(scope, 'src/feature')
  assert.deepEqual(persistedOrder(harness.files, scope), ['src/other.ts'])
  await harness.store.removeTree(scope, 'src/other.ts')
  assert.equal(harness.files.has(orderPath(scope)), false)
  assert.deepEqual(harness.deletes, [orderPath(scope)])

  harness = createHarness()
  harness.files.set(orderPath(scope), ['src/a.ts', 'src/b.ts'])
  await harness.store.renameFile({
    oldBookmarkFolder: scope,
    newBookmarkFolder: scope,
    oldBookmarkPath: 'src/a.ts',
    newBookmarkPath: 'src/c.ts',
  })
  assert.deepEqual(persistedOrder(harness.files, scope), ['src/c.ts', 'src/b.ts'])
  const writesAfterRename = harness.writes.length
  await harness.store.renameFile({
    oldBookmarkFolder: scope,
    newBookmarkFolder: scope,
    oldBookmarkPath: 'missing.ts',
    newBookmarkPath: 'src/c.ts',
  })
  assert.equal(harness.writes.length, writesAfterRename)

  harness.files.set(orderPath(scope), ['src/a.ts'])
  harness.files.set(orderPath(targetScope), ['src/existing.ts'])
  await harness.store.renameFile({
    oldBookmarkFolder: scope,
    newBookmarkFolder: targetScope,
    oldBookmarkPath: 'src/a.ts',
    newBookmarkPath: 'src/moved.ts',
  }, 0)
  assert.equal(harness.files.has(orderPath(scope)), false)
  assert.deepEqual(persistedOrder(harness.files, targetScope), ['src/moved.ts', 'src/existing.ts'])

  harness = createHarness()
  harness.files.set(orderPath(scope), ['src/old/a.ts', 'src/old/b.ts', 'src/other.ts'])
  await harness.store.renameDirectory({
    oldBookmarkFolder: scope,
    newBookmarkFolder: scope,
    oldBookmarkPath: 'src/old',
    newBookmarkPath: 'src/new',
  })
  assert.deepEqual(persistedOrder(harness.files, scope), ['src/new/a.ts', 'src/new/b.ts', 'src/other.ts'])

  harness.files.set(orderPath(scope), ['src/old/a.ts', 'src/other.ts'])
  harness.files.set(orderPath(targetScope), ['src/existing.ts'])
  await harness.store.renameDirectory({
    oldBookmarkFolder: scope,
    newBookmarkFolder: targetScope,
    oldBookmarkPath: 'src/old',
    newBookmarkPath: 'src/new',
  })
  assert.deepEqual(persistedOrder(harness.files, scope), ['src/other.ts'])
  assert.deepEqual(persistedOrder(harness.files, targetScope), ['src/existing.ts', 'src/new/a.ts'])

  harness = createHarness()
  harness.failWrites()
  await assert.rejects(
    harness.store.append(scope, 'src/a.ts', 'custom order failure'),
    /custom order failure/,
  )
  assert.equal(harness.files.has(orderPath(scope)), false)
  console.log('WorkspaceOrderStore contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
