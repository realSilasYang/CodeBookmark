/**
 * 检查准备好的视图快照只有在会话仍有效时才会提交，并按固定顺序发布状态。
 * 脚本直接调用编译后的 `BookmarkViewCommitter`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { commitBookmarkView } = require('../out/providers/BookmarkViewCommitter')

function createHarness(overrides = {}) {
  const events = []
  const bookmarks = overrides.bookmarks ?? {
    values: [{ isFile: true, path: 'src/a.ts' }],
    size: 1,
  }
  let scope = overrides.scope ?? 'workspace:old'
  let count = overrides.count ?? 1
  const port = {
    currentStorageScope: () => {
      events.push(`scope:${scope}`)
      return scope
    },
    currentBookmarkCount: () => {
      events.push(`count:${count}`)
      return count
    },
    handleStorageScopeChange: () => events.push('scopeChanged'),
    setCurrentStorageScope: value => {
      events.push(`setScope:${value}`)
      scope = value
    },
    setCurrentScopeFilePath: value => events.push(`setPath:${value ?? 'none'}`),
    setWorkspaceOrder: value => events.push(`setOrder:${value?.join(',') ?? 'none'}`),
    setWorkspaceLayout: value => events.push(`setLayout:${value?.entries.length ?? 'none'}`),
    setBookmarks: value => {
      events.push('setBookmarks')
      assert.equal(value, bookmarks)
    },
    rebuildFileNodeCache: value => {
      events.push(`rebuild:${value.length}`)
      assert.equal(value, bookmarks.values)
    },
    invalidatePathIndex: () => events.push('invalidatePathIndex'),
  }
  return { events, port }
}

function prepared(overrides = {}) {
  const bookmarks = overrides.bookmarks ?? {
    values: [{ isFile: true, path: 'src/a.ts' }],
    size: 1,
  }
  return {
    storageScope: 'workspace:new',
    scopeFilePath: 'C:/workspace/main.ts',
    workspaceOrder: ['src/a.ts'],
    workspaceOrderFilePath: 'C:/workspace/_workspace_order.json',
    workspaceOrderNeedsPersist: true,
    workspaceLayout: {
      format: 'codebookmark.workspace-layout', schemaVersion: 1, updatedAt: 1,
      entries: [{ node: { kind: 'script', scriptId: 'script-a' }, parent: null }],
      hiddenFiles: [], pinnedContainer: null,
    },
    workspaceLayoutNeedsPersist: false,
    workspaceLayoutWriteBlocked: false,
    contentUpdated: false,
    ...overrides,
    bookmarks,
  }
}

function main() {
  const firstPrepared = prepared()
  let harness = createHarness({ bookmarks: firstPrepared.bookmarks })
  let result = commitBookmarkView(firstPrepared, harness.port)
  assert.deepEqual(result, { previousHasContent: true, nextHasContent: true })
  assert.deepEqual(harness.events, [
    'count:1',
    'scope:workspace:old',
    'scopeChanged',
    'setScope:workspace:new',
    'setPath:C:/workspace/main.ts',
    'setOrder:src/a.ts',
    'setLayout:1',
    'setBookmarks',
    'rebuild:1',
    'invalidatePathIndex',
  ])

  const secondPrepared = prepared({ bookmarks: { values: [], size: 0 } })
  harness = createHarness({ scope: 'workspace:new', count: 0, bookmarks: secondPrepared.bookmarks })
  result = commitBookmarkView(secondPrepared, harness.port)
  assert.deepEqual(result, { previousHasContent: false, nextHasContent: false })
  assert.equal(harness.events.includes('scopeChanged'), false)
  assert.equal(harness.events.includes('invalidatePathIndex'), true)

  console.log('BookmarkViewCommitter contract verified.')
}

main()
