/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-idle-view-coordinator`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-idle-view-coordinator` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-idle-view-coordinator”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { BookmarkIdleViewCoordinator } = require('../out/providers/BookmarkIdleViewCoordinator')

function createHarness(options = {}) {
  const events = []
  const state = {
    hasActiveFileEditor: options.hasActiveFileEditor ?? false,
    hasOpenFileTab: options.hasOpenFileTab ?? false,
    workspaceRoot: options.workspaceRoot,
    currentStorageScope: options.currentStorageScope,
    currentScopeFilePath: options.currentScopeFilePath,
    currentBookmarkCount: options.currentBookmarkCount ?? 0,
  }
  const port = {
    hasActiveFileEditor: () => state.hasActiveFileEditor,
    hasOpenFileTab: () => state.hasOpenFileTab,
    workspaceRoot: () => state.workspaceRoot,
    workspaceScope: root => `workspace:${root.toLowerCase()}`,
    currentStorageScope: () => state.currentStorageScope,
    currentScopeFilePath: () => state.currentScopeFilePath,
    currentBookmarkCount: () => state.currentBookmarkCount,
    refresh: async (scope, forceReloadDisk) => { events.push(`refresh:${scope}:${forceReloadDisk}`) },
    queuePresenceContexts: async () => { events.push('contexts') },
  }
  return { events, port, state }
}

async function main() {
  const coordinator = new BookmarkIdleViewCoordinator()

  const activeFile = createHarness({ hasActiveFileEditor: true, currentBookmarkCount: 3 })
  await coordinator.handle(activeFile.port)
  assert.deepEqual(activeFile.events, [])

  const retainedStandalone = createHarness({
    hasOpenFileTab: true,
    currentStorageScope: 'file:c:\\src\\a.ts',
    currentScopeFilePath: 'C:\\src\\a.ts',
    currentBookmarkCount: 3,
  })
  await coordinator.handle(retainedStandalone.port)
  assert.deepEqual(retainedStandalone.events, [])

  const clearedStandalone = createHarness({
    currentStorageScope: 'file:c:\\src\\a.ts',
    currentScopeFilePath: 'C:\\src\\a.ts',
    currentBookmarkCount: 3,
  })
  await coordinator.handle(clearedStandalone.port)
  assert.deepEqual(clearedStandalone.events, ['refresh:global:true'])

  const alreadyEmpty = createHarness({ currentStorageScope: 'global' })
  await coordinator.handle(alreadyEmpty.port)
  assert.deepEqual(alreadyEmpty.events, ['contexts'])

  const workspace = createHarness({
    workspaceRoot: 'C:\\Workspace',
    currentStorageScope: 'workspace:c:\\workspace',
    currentBookmarkCount: 3,
  })
  await coordinator.handle(workspace.port)
  assert.deepEqual(workspace.events, ['refresh:workspace:c:\\workspace:false'])
}

main().then(
  () => console.log('BookmarkIdleViewCoordinator contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
