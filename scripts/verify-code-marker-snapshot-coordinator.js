/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-code-marker-snapshot-coordinator`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-code-marker-snapshot-coordinator` 对应契约。
 * 核心边界：通过断言锁定“verify-code-marker-snapshot-coordinator”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
      warnWorkspaceDiscoveryTruncated: (scope, limit) => events.push(`warning:workspace:${scope}:${limit}`),
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
  assert.equal(synchronized.coordinator.fileNodeHasCodeMarkers(synchronized.bookmarks.values[0]), true)

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

  synchronized.coordinator.warnWorkspaceDiscoveryTruncated('workspace:one', 2000, synchronized.port)
  synchronized.coordinator.warnWorkspaceDiscoveryTruncated('workspace:one', 2000, synchronized.port)
  assert.equal(synchronized.events.filter(event => event === 'warning:workspace:workspace:one:2000').length, 1)

  assert.equal(synchronized.coordinator.removeMarkers(uri, synchronized.port), true)
  assert.equal(synchronized.bookmarks.size, 0)

  console.log('CodeMarkerSnapshotCoordinator contract verified.')
} finally {
  restoreModules()
}
