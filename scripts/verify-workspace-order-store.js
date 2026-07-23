/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-workspace-order-store`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-workspace-order-store` 对应契约。
 * 核心边界：通过断言锁定“verify-workspace-order-store”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
