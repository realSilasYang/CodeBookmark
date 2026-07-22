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

  function createHarness(maxMarkers = 1) {
    const events = []
    const bookmarks = new BookmarkSet()
    const coordinator = new CodeMarkerSnapshotCoordinator(maxMarkers)
    let currentScope = true
    const port = {
      isFileUri: uri => uri.scheme === 'file',
      isCurrentScope: () => currentScope,
      filePath: uri => uri.fsPath,
      relativeBookmarkPath: filePath => filePath.replace('C:/workspace/', ''),
      bookmarks: () => bookmarks,
      profileFor: () => undefined,
      warnFileTruncated: (filePath, limit) => events.push(`warning:truncated:${filePath}:${limit}`),
      warnFileCapacityLimited: filePath => events.push(`warning:capacity:${filePath}`),
      warnWorkspaceDiscoveryTruncated: (scope, limit) => events.push(`warning:workspace:${scope}:${limit}`),
      invalidatePathIndex: () => events.push('index:invalidate'),
      saveBookmarks: paths => events.push(`save:${paths.join(',')}`),
      refreshDecorations: () => events.push('refresh'),
    }
    return { bookmarks, coordinator, events, port, setCurrentScope: value => { currentScope = value } }
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
