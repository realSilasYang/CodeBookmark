/**
 * 验证 AI 生成后的工作区展开状态只在脚本配置保存完成后写入，并在作用域切换时停止提交。
 * 这条顺序契约避免布局先引用尚未落盘的新书签，也防止旧任务覆盖刚切换到的工作区。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const { vscode } = createVscodeFake()
const restoreModules = installModuleMocks({ vscode })
const { Bookmark } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { captureWorkspaceLayout } = require('../out/models/BookmarkOwnership')
const { ContextBookmark } = require('../out/util/ContextValue')
const { persistGeneratedWorkspaceExpansion } = require('../out/providers/WorkspaceLayoutPersistenceCoordinator')
restoreModules()

function createHarness() {
  const child = new Bookmark({ id: 'child', path: 'src/main.ts', label: '入口' })
  const file = new Bookmark({
    id: 'file',
    path: 'src/main.ts',
    scriptId: '10000000-0000-9000-1000-000000000001',
    contextValue: ContextBookmark.File,
    subs: new BookmarkSet([child]),
    collapsible: vscode.TreeItemCollapsibleState.Collapsed,
  })
  child.parent = file
  const bookmarks = new BookmarkSet([file])
  const currentLayout = captureWorkspaceLayout(bookmarks)
  file.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
  const events = []
  let scope = 'workspace:test'
  let savedLayout
  const port = {
    isWorkspaceScope: () => true,
    writeBlocked: () => false,
    storageFolder: () => 'C:/bookmarks/scope',
    bookmarks: () => bookmarks,
    currentLayout: () => currentLayout,
    pinnedContainer: () => undefined,
    writeJson: async (filePath, value) => {
      events.push(`write:${path.basename(filePath)}`)
      savedLayout = value
      return true
    },
    setLayout: () => events.push('set-layout'),
    reportWriteFailure: () => events.push('write-failure'),
  }
  const queue = {
    run: async task => {
      events.push('queue:start')
      const result = await task()
      events.push('queue:end')
      return result
    },
  }
  return {
    events,
    port,
    queue,
    currentScope: () => scope,
    setScope: value => { scope = value },
    savedLayout: () => savedLayout,
  }
}

async function main() {
  let harness = createHarness()
  await persistGeneratedWorkspaceExpansion(
    'workspace:test',
    harness.currentScope,
    harness.queue,
    async () => { harness.events.push('flush') },
    harness.port,
  )
  assert.deepEqual(harness.events, [
    'queue:start',
    'flush',
    'write:_workspace_layout.json',
    'set-layout',
    'queue:end',
  ])
  assert.equal(harness.savedLayout().expansionStates[0].expanded, true)

  harness = createHarness()
  await persistGeneratedWorkspaceExpansion(
    'workspace:test',
    harness.currentScope,
    harness.queue,
    async () => {
      harness.events.push('flush')
      harness.setScope('workspace:other')
    },
    harness.port,
  )
  assert.deepEqual(harness.events, ['queue:start', 'flush', 'queue:end'])

  harness = createHarness()
  await persistGeneratedWorkspaceExpansion(
    'file:C:/main.ts',
    harness.currentScope,
    harness.queue,
    async () => { harness.events.push('flush') },
    harness.port,
  )
  assert.deepEqual(harness.events, [])

  console.log('Generated workspace expansion persistence verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
