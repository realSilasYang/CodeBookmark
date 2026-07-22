const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')
const { createVscodeFake } = require('./test-support/vscode-fake')

const { vscode } = createVscodeFake()
const restoreModules = installModuleMocks({ vscode })

const { Bookmark } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { ContextBookmark } = require('../out/util/ContextValue')
const { prepareBookmarkView } = require('../out/providers/BookmarkViewPreparation')

function fileBookmark(id, scriptPath, subs = new BookmarkSet()) {
  return new Bookmark({ id, contextValue: ContextBookmark.File, path: scriptPath, subs })
}

function pinnedBookmark(id, label) {
  return new Bookmark({ id, label, isPinned: true })
}

async function main() {
  const remembered = pinnedBookmark('remembered-pin', 'Remembered pin')
  const loadedPin = new Bookmark({ id: remembered.id, label: 'Loaded pin' })
  const duplicateA = fileBookmark('file-a', 'src/a.ts')
  const duplicateB = fileBookmark('file-b', 'src/a.ts')
  const loaded = [duplicateA, duplicateB, loadedPin]
  const events = []
  const abortController = new AbortController()
  let contentBookmarks
  let orderBookmarks
  let orderTarget
  const result = await prepareBookmarkView(
    { storageScope: 'workspace:one', scopeFilePath: 'C:/workspace/main.ts' },
    {
      currentStorageScope: 'workspace:one',
      currentBookmarks: [remembered],
      readBookmarks: async (activePaths, signal) => {
        events.push(`read:${activePaths.join(',')}:${signal === abortController.signal}`)
        return loaded
      },
      readContentBookmarks: async (bookmarks, scopeFilePath, signal) => {
        events.push(`content:${scopeFilePath}:${signal === abortController.signal}`)
        contentBookmarks = bookmarks
        return 2
      },
      readWorkspaceOrder: async (bookmarks, target, signal) => {
        events.push(`order:${target.storageScope}:${signal === abortController.signal}`)
        orderBookmarks = bookmarks
        orderTarget = target
        return { order: ['src/a.ts'], filePath: 'C:/workspace/_workspace_order.json', needsPersist: true }
      },
    },
    abortController.signal,
  )

  assert.equal(result.storageScope, 'workspace:one')
  assert.equal(result.scopeFilePath, 'C:/workspace/main.ts')
  assert.equal(result.contentUpdated, true)
  assert.deepEqual(result.workspaceOrder, ['src/a.ts'])
  assert.equal(result.workspaceOrderFilePath, 'C:/workspace/_workspace_order.json')
  assert.equal(result.workspaceOrderNeedsPersist, true)
  assert.equal(result.bookmarks.size, 2)
  assert.equal(result.bookmarks.values.find(bookmark => bookmark.id === remembered.id).isPinned, true)
  assert.equal(contentBookmarks, result.bookmarks)
  assert.equal(orderBookmarks, result.bookmarks)
  assert.equal(orderTarget.storageScope, 'workspace:one')
  assert.deepEqual(events.sort(), [
    'content:C:/workspace/main.ts:true',
    'order:workspace:one:true',
    'read:C:/workspace/main.ts:true',
  ])

  const changedScope = await prepareBookmarkView(
    { storageScope: 'workspace:two' },
    {
      currentStorageScope: 'workspace:one',
      currentBookmarks: [remembered],
      readBookmarks: async () => [new Bookmark({ id: remembered.id, label: 'Unpinned' })],
      readContentBookmarks: async () => 0,
      readWorkspaceOrder: async () => ({ order: null, needsPersist: false }),
    },
  )
  assert.equal(changedScope.bookmarks.values[0].isPinned, false)
  assert.equal(changedScope.contentUpdated, false)

  restoreModules()
  console.log('BookmarkViewPreparation contract verified.')
}

main().catch(error => {
  restoreModules()
  console.error(error)
  process.exitCode = 1
})
