/**
 * 检查扫描快照与自动书签的新增、更新、删除、容量限制及语言支持消失后的清理。
 * 脚本直接调用编译后的 `BookmarkSet`、`CodeMarkerSnapshotCoordinator`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')
const { createVscodeFake } = require('./test-support/vscode-fake')

const { vscode } = createVscodeFake({
  workspace: {
    getConfiguration: section => ({
      get: key => section === 'codebookmark' && key === 'autoSpace' ? true : undefined,
    }),
  },
})
const restoreModules = installModuleMocks({ vscode })

try {
  const { BookmarkSet } = require('../out/models/BookmarkSet')
  const { CodeMarkerSnapshotCoordinator } = require('../out/providers/CodeMarkerSnapshotCoordinator')

  const cLikeProfile = { lineComments: [{ value: '//' }], blockComments: [['/*', '*/']] }

  function createHarness(maxMarkers = 1) {
    const events = []
    const bookmarks = new BookmarkSet()
    const coordinator = new CodeMarkerSnapshotCoordinator(maxMarkers)
    let currentScope = true
    let currentProfile = cLikeProfile
    const port = {
      isFileUri: uri => uri.scheme === 'file',
      isCurrentScope: () => currentScope,
      filePath: uri => uri.fsPath,
      relativeBookmarkPath: filePath => filePath.replace('C:/workspace/', ''),
      bookmarks: () => bookmarks,
      profileFor: () => currentProfile,
      warnFileTruncated: (filePath, limit) => events.push(`warning:truncated:${filePath}:${limit}`),
      warnFileCapacityLimited: filePath => events.push(`warning:capacity:${filePath}`),
      invalidatePathIndex: () => events.push('index:invalidate'),
      saveBookmarks: paths => events.push(`save:${paths.join(',')}`),
      refreshDecorations: () => events.push('refresh'),
    }
    return {
      bookmarks,
      coordinator,
      events,
      port,
      setCurrentScope: value => { currentScope = value },
      setProfile: value => { currentProfile = value },
    }
  }

  const uri = { scheme: 'file', fsPath: 'C:/workspace/src/main.ts' }
  const synchronized = createHarness()
  const first = synchronized.coordinator.synchronizeSnapshot(
    uri,
    ['// TODO: first', '// FIXME: second'],
    'typescript',
    synchronized.port,
  )
  assert.equal(first.changed, true)
  assert.equal(first.created, 1)
  assert.deepEqual(synchronized.events, ['warning:truncated:C:/workspace/src/main.ts:1'])
  synchronized.coordinator.synchronizeSnapshot(
    uri,
    ['// TODO: first', '// FIXME: second'],
    'typescript',
    synchronized.port,
  )
  assert.equal(synchronized.events.length, 1)
  assert.equal(synchronized.bookmarks.size, 1)
  const synchronizedFileNode = synchronized.bookmarks.values[0]
  assert.equal(synchronized.coordinator.fileNodeHasCodeMarkers(synchronizedFileNode, synchronized.bookmarks), true)

  // 工作区布局可以把自动标记显示到其他文件节点或根级；是否属于某个脚本必须按
  // ownerScriptId 在整棵树中判断，不能只检查原文件节点当前的视觉子树。
  const visuallyMovedMarker = synchronizedFileNode.subs.values[0]
  synchronizedFileNode.subs.delete(0)
  visuallyMovedMarker.parent = undefined
  synchronized.bookmarks.add(visuallyMovedMarker)
  assert.equal(synchronized.coordinator.fileNodeHasCodeMarkers(synchronizedFileNode, synchronized.bookmarks), true)
  synchronized.bookmarks.fastDelete(visuallyMovedMarker)
  synchronizedFileNode.subs.add(visuallyMovedMarker)
  visuallyMovedMarker.parent = synchronizedFileNode

  const removedAfterDirectiveBecameProse = synchronized.coordinator.synchronizeSnapshot(
    uri,
    ['// Automatic TODO/FIXME/BUG bookmarks are synchronized from explicit directives.'],
    'typescript',
    synchronized.port,
  )
  assert.equal(removedAfterDirectiveBecameProse.removed, 1)
  assert.equal(synchronized.bookmarks.size, 0)

  synchronized.coordinator.synchronizeSnapshot(uri, ['// TODO: restored'], 'typescript', synchronized.port)
  synchronized.setProfile(undefined)
  const removedAfterLanguageSupportDisappeared = synchronized.coordinator.synchronizeSnapshot(
    uri,
    ['// TODO: first'],
    'plaintext',
    synchronized.port,
  )
  assert.equal(removedAfterLanguageSupportDisappeared.removed, 1)
  assert.equal(synchronized.bookmarks.size, 0)

  synchronized.setProfile(cLikeProfile)
  synchronized.coordinator.synchronizeSnapshot(uri, ['// TODO: restored'], 'typescript', synchronized.port)

  const ignored = createHarness()
  ignored.setCurrentScope(false)
  assert.deepEqual(
    ignored.coordinator.synchronizeSnapshot(uri, ['// TODO'], 'typescript', ignored.port),
    { changed: false, created: 0, removed: 0 },
  )
  assert.equal(ignored.bookmarks.size, 0)

  synchronized.coordinator.persistChanges(
    ['C:/workspace/src/main.ts', 'C:/workspace/src/main.ts'],
    synchronized.port,
  )
  assert.deepEqual(synchronized.events.slice(-3), [
    'index:invalidate',
    'save:C:/workspace/src/main.ts',
    'refresh',
  ])
  const beforeNoopPersist = synchronized.events.length
  synchronized.coordinator.persistChanges([], synchronized.port)
  assert.equal(synchronized.events.length, beforeNoopPersist)

  assert.equal(synchronized.coordinator.removeMarkers(uri, synchronized.port), true)
  assert.equal(synchronized.bookmarks.size, 0)

  console.log('CodeMarkerSnapshotCoordinator contract verified.')
} finally {
  restoreModules()
}
