/**
 * 检查撤销重做的空历史、作用域匹配、快照恢复、保存失败和最终提示。
 * 脚本直接调用编译后的 `BookmarkHistoryWorkflowRunner`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { runBookmarkHistoryOperation } = require('../out/providers/BookmarkHistoryWorkflowRunner')

function nestedBookmarks() {
  const file = { isFile: true, subs: [] }
  const root = { isFile: false, parent: file, subs: [] }
  const child = { isFile: false, parent: root, subs: [] }
  root.subs.push(child)
  file.subs.push(root)
  return [file]
}

function createHarness(options = {}) {
  const events = []
  let currentPaths = [...(options.previousPaths ?? [])]
  let workspaceOrder
  let workspaceLayout
  const port = {
    applyHistory: operation => {
      events.push(`apply:${operation}`)
      currentPaths = [...(options.restoredPaths ?? currentPaths)]
      return options.result
    },
    currentStorageScope: () => options.storageScope,
    setWorkspaceOrder: order => {
      workspaceOrder = order === null ? null : [...order]
      events.push(`order:set:${order === null ? 'null' : order.join(',')}`)
    },
    setWorkspaceLayout: layout => {
      workspaceLayout = layout
      events.push(`layout:set:${layout ? layout.entries.length : 'null'}`)
    },
    workspaceOrderFilePath: () => {
      events.push('order:path')
      return options.orderFilePath
    },
    writeWorkspaceOrder: async (filePath, order) => {
      events.push(`order:write:${filePath}:${order.join(',')}`)
      return options.writeResult ?? true
    },
    reportWorkspaceOrderSaveFailure: () => { events.push('order:warning') },
    bookmarkSourcePaths: () => {
      events.push(`paths:${currentPaths.join(',')}`)
      return [...currentPaths]
    },
    bookmarks: () => options.bookmarks ?? [],
    saveBookmarks: paths => { events.push(`save:${paths.join(',')}`) },
    saveAllBookmarks: () => { events.push('save:all') },
    commitTopology: async () => { events.push('commit') },
    refreshDecoration: () => { events.push('refresh') },
    showAppliedMessage: message => { events.push(`applied:${message}`) },
    showUnavailableMessage: message => { events.push(`unavailable:${message}`) },
  }
  return { events, port, workspaceOrder: () => workspaceOrder, workspaceLayout: () => workspaceLayout }
}

async function main() {
  const workspaceUndo = createHarness({
    storageScope: 'workspace:C:\\workspace',
    previousPaths: ['C:\\workspace\\old.ts', 'C:\\workspace\\shared.ts'],
    restoredPaths: ['C:\\workspace\\new.ts', 'C:\\workspace\\shared.ts'],
    result: {
      action: 'deleteBookmarks',
      workspaceOrder: ['src/new.ts', 'src/shared.ts'],
      workspaceLayout: {
        format: 'codebookmark.workspace-layout', schemaVersion: 1, updatedAt: 1,
        entries: [{ node: { kind: 'script', scriptId: 'script-new' }, parent: null }],
        hiddenFiles: [], pinnedContainer: null,
      },
    },
    orderFilePath: 'C:\\bookmarks\\_workspace_order.json',
    bookmarks: nestedBookmarks(),
  })
  await runBookmarkHistoryOperation('undo', workspaceUndo.port)
  assert.deepEqual(workspaceUndo.workspaceOrder(), ['src/new.ts', 'src/shared.ts'])
  assert.equal(workspaceUndo.workspaceLayout().entries.length, 1)
  assert.deepEqual(workspaceUndo.events, [
    'paths:C:\\workspace\\old.ts,C:\\workspace\\shared.ts',
    'apply:undo',
    'paths:C:\\workspace\\new.ts,C:\\workspace\\shared.ts',
    'save:C:\\workspace\\old.ts,C:\\workspace\\shared.ts,C:\\workspace\\new.ts',
    'order:set:src/new.ts,src/shared.ts',
    'order:path',
    'order:write:C:\\bookmarks\\_workspace_order.json:src/new.ts,src/shared.ts',
    'layout:set:1',
    'commit',
    'refresh',
    'applied:已撤销：删除书签。当前结果：共 2 个书签：一级 1 个、二级 1 个。',
  ])

  const failedOrderWrite = createHarness({
    storageScope: 'workspace:C:\\workspace',
    previousPaths: ['C:\\workspace\\before.ts'],
    restoredPaths: ['C:\\workspace\\after.ts'],
    result: { action: 'reorderFiles', workspaceOrder: null, workspaceLayout: null },
    orderFilePath: 'C:\\bookmarks\\_workspace_order.json',
    writeResult: false,
  })
  await runBookmarkHistoryOperation('redo', failedOrderWrite.port)
  assert.deepEqual(failedOrderWrite.workspaceOrder(), [])
  assert.deepEqual(failedOrderWrite.events.slice(2, 8), [
    'paths:C:\\workspace\\after.ts',
    'save:C:\\workspace\\before.ts,C:\\workspace\\after.ts',
    'order:set:',
    'order:path',
    'order:write:C:\\bookmarks\\_workspace_order.json:',
    'order:warning',
  ])
  assert.equal(failedOrderWrite.events.at(-1), 'applied:已重做：调整文件顺序。当前结果：共 0 个书签。')

  const standalone = createHarness({
    storageScope: 'file:C:\\scripts\\main.ts',
    previousPaths: ['C:\\scripts\\main.ts'],
    restoredPaths: ['C:\\scripts\\main.ts'],
    result: { action: 'changeBookmarkIcons', workspaceOrder: ['ignored.ts'], workspaceLayout: null },
  })
  await runBookmarkHistoryOperation('redo', standalone.port)
  assert.equal(standalone.workspaceOrder(), null)
  assert.equal(standalone.events.includes('order:path'), false)
  assert.ok(standalone.events.includes('save:C:\\scripts\\main.ts'))
  assert.equal(standalone.events.at(-1), 'applied:已重做：更改书签图标。当前结果：共 0 个书签。')

  const emptyTree = createHarness({
    storageScope: 'global',
    result: { action: 'modifyBookmarks', workspaceOrder: null, workspaceLayout: null },
  })
  await runBookmarkHistoryOperation('undo', emptyTree.port)
  assert.ok(emptyTree.events.includes('save:all'))
  assert.equal(emptyTree.events.at(-1), 'applied:已撤销：修改书签。当前结果：共 0 个书签。')

  const unavailableUndo = createHarness({
    storageScope: 'workspace:C:\\workspace',
    previousPaths: ['C:\\workspace\\still-present.ts'],
  })
  await runBookmarkHistoryOperation('undo', unavailableUndo.port)
  assert.deepEqual(unavailableUndo.events, [
    'paths:C:\\workspace\\still-present.ts',
    'apply:undo',
    'unavailable:没有可以撤销的操作。',
  ])

  const unavailableRedo = createHarness({ storageScope: 'global' })
  await runBookmarkHistoryOperation('redo', unavailableRedo.port)
  assert.equal(unavailableRedo.events.at(-1), 'unavailable:没有可以恢复的操作。')
}

main().then(
  () => console.log('BookmarkHistoryWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
