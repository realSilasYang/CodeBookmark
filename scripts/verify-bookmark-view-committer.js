/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-view-committer`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-view-committer` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-view-committer”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`prepared`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
