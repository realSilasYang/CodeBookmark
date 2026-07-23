/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-history-workflow-runner`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-history-workflow-runner` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-history-workflow-runner”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`nestedBookmarks`、`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
    refreshDecoration: () => { events.push('refresh') },
    showAppliedMessage: message => { events.push(`applied:${message}`) },
    showUnavailableMessage: message => { events.push(`unavailable:${message}`) },
  }
  return { events, port, workspaceOrder: () => workspaceOrder }
}

async function main() {
  const workspaceUndo = createHarness({
    storageScope: 'workspace:C:\\workspace',
    previousPaths: ['C:\\workspace\\old.ts', 'C:\\workspace\\shared.ts'],
    restoredPaths: ['C:\\workspace\\new.ts', 'C:\\workspace\\shared.ts'],
    result: { action: 'deleteBookmarks', workspaceOrder: ['src/new.ts', 'src/shared.ts'] },
    orderFilePath: 'C:\\bookmarks\\_workspace_order.json',
    bookmarks: nestedBookmarks(),
  })
  await runBookmarkHistoryOperation('undo', workspaceUndo.port)
  assert.deepEqual(workspaceUndo.workspaceOrder(), ['src/new.ts', 'src/shared.ts'])
  assert.deepEqual(workspaceUndo.events, [
    'paths:C:\\workspace\\old.ts,C:\\workspace\\shared.ts',
    'apply:undo',
    'order:set:src/new.ts,src/shared.ts',
    'order:path',
    'order:write:C:\\bookmarks\\_workspace_order.json:src/new.ts,src/shared.ts',
    'paths:C:\\workspace\\new.ts,C:\\workspace\\shared.ts',
    'save:C:\\workspace\\old.ts,C:\\workspace\\shared.ts,C:\\workspace\\new.ts',
    'refresh',
    'applied:已撤销：删除书签。当前结果：共 2 个书签：一级 1 个、二级 1 个。',
  ])

  const failedOrderWrite = createHarness({
    storageScope: 'workspace:C:\\workspace',
    previousPaths: ['C:\\workspace\\before.ts'],
    restoredPaths: ['C:\\workspace\\after.ts'],
    result: { action: 'reorderFiles', workspaceOrder: null },
    orderFilePath: 'C:\\bookmarks\\_workspace_order.json',
    writeResult: false,
  })
  await runBookmarkHistoryOperation('redo', failedOrderWrite.port)
  assert.deepEqual(failedOrderWrite.workspaceOrder(), [])
  assert.deepEqual(failedOrderWrite.events.slice(2, 7), [
    'order:set:',
    'order:path',
    'order:write:C:\\bookmarks\\_workspace_order.json:',
    'order:warning',
    'paths:C:\\workspace\\after.ts',
  ])
  assert.equal(failedOrderWrite.events.at(-1), 'applied:已重做：调整文件顺序。当前结果：共 0 个书签。')

  const standalone = createHarness({
    storageScope: 'file:C:\\scripts\\main.ts',
    previousPaths: ['C:\\scripts\\main.ts'],
    restoredPaths: ['C:\\scripts\\main.ts'],
    result: { action: 'changeBookmarkIcons', workspaceOrder: ['ignored.ts'] },
  })
  await runBookmarkHistoryOperation('redo', standalone.port)
  assert.equal(standalone.workspaceOrder(), null)
  assert.equal(standalone.events.includes('order:path'), false)
  assert.ok(standalone.events.includes('save:C:\\scripts\\main.ts'))
  assert.equal(standalone.events.at(-1), 'applied:已重做：更改书签图标。当前结果：共 0 个书签。')

  const emptyTree = createHarness({
    storageScope: 'global',
    result: { action: 'modifyBookmarks', workspaceOrder: null },
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
