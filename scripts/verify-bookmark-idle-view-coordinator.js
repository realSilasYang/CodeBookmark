/**
 * 验证单文件模式下欢迎页、非文件编辑器与活动脚本切换时书签树的显隐。
 * 脚本直接调用编译后的 `BookmarkIdleViewCoordinator`，只在 VS Code 或文件系统边界使用最小替身。
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
