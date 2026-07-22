const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const errorMessages = []
const { vscode } = createVscodeFake({
  window: {
    showErrorMessage: message => { errorMessages.push(message) },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { BookmarkSaveCoordinator } = require('../out/providers/BookmarkSaveCoordinator')
restoreModules()

class FakeScheduling {
  constructor() {
    this.timers = []
  }

  setTimer(callback, delay) {
    const timer = { callback, delay }
    this.timers.push(timer)
    return timer
  }

  clearTimer(timer) {
    const index = this.timers.indexOf(timer)
    if (index >= 0) this.timers.splice(index, 1)
  }

  async runNext() {
    const timer = this.timers.shift()
    assert.ok(timer, 'Expected a scheduled save')
    timer.callback()
    await new Promise(resolve => setImmediate(resolve))
    await new Promise(resolve => setImmediate(resolve))
    return timer.delay
  }
}

function createHarness() {
  const scheduling = new FakeScheduling()
  const saves = []
  let bookmarks = [{ id: 'initial', path: 'src/initial.ts' }]
  let storageRoot = 'C:\\bookmark-storage'
  let activeFilePath
  let currentScopeFilePath
  let saveImplementation = async () => true
  const port = {
    ensureStorageRoot: () => storageRoot,
    currentBookmarks: () => bookmarks,
    activeFilePathInCurrentScope: () => activeFilePath,
    currentScopeFilePath: () => currentScopeFilePath,
    setCurrentScopeFilePath: filePath => { currentScopeFilePath = filePath },
    absoluteBookmarkPath: bookmarkPath => `C:\\workspace\\${bookmarkPath.replace(/\//g, '\\')}`,
    workspaceKeyForPath: filePath => filePath.startsWith('workspace:') ? 'workspace-root' : undefined,
    saveSnapshot: async (snapshot, filePath, root, dirtyPaths) => {
      saves.push({
        bookmarkIds: snapshot.map(bookmark => bookmark.id),
        filePath,
        storageRoot: root,
        dirtyPaths: dirtyPaths ? [...dirtyPaths] : undefined,
      })
      return saveImplementation(snapshot, filePath, root, dirtyPaths)
    },
  }
  const coordinator = new BookmarkSaveCoordinator(port, scheduling)
  return {
    coordinator,
    scheduling,
    saves,
    setBookmarks: value => { bookmarks = value },
    setStorageRoot: value => { storageRoot = value },
    setActiveFilePath: value => { activeFilePath = value },
    setCurrentScopeFilePath: value => { currentScopeFilePath = value },
    getCurrentScopeFilePath: () => currentScopeFilePath,
    setSaveImplementation: value => { saveImplementation = value },
  }
}

async function main() {
  const grouped = createHarness()
  grouped.coordinator.queuePaths(['workspace:a.ts', 'workspace:b.ts', 'workspace:a.ts'])
  assert.deepEqual(grouped.scheduling.timers.map(timer => timer.delay), [500])
  grouped.setBookmarks([{ id: 'rebased', path: 'src/rebased.ts' }])
  grouped.coordinator.rebasePendingSaves([{ id: 'rebased', path: 'src/rebased.ts' }])
  await grouped.coordinator.flushPendingSaves()
  assert.equal(grouped.coordinator.isSaving, false)
  assert.deepEqual(grouped.scheduling.timers, [])
  assert.deepEqual(grouped.saves, [{
    bookmarkIds: ['rebased'],
    filePath: 'workspace:b.ts',
    storageRoot: 'C:\\bookmark-storage',
    dirtyPaths: ['workspace:a.ts', 'workspace:b.ts'],
  }])

  const singleFlight = createHarness()
  let releaseSave
  singleFlight.setSaveImplementation(() => new Promise(resolve => { releaseSave = resolve }))
  singleFlight.coordinator.queuePaths(['standalone.ts'])
  const firstFlush = singleFlight.coordinator.flushPendingSaves()
  const secondFlush = singleFlight.coordinator.flushPendingSaves()
  assert.equal(singleFlight.coordinator.isSaving, true)
  releaseSave(true)
  await Promise.all([firstFlush, secondFlush])
  assert.equal(singleFlight.saves.length, 1)
  assert.equal(singleFlight.coordinator.isSaving, false)

  const activeFallback = createHarness()
  activeFallback.setActiveFilePath('active.ts')
  activeFallback.coordinator.queueAll()
  assert.equal(activeFallback.getCurrentScopeFilePath(), 'active.ts')
  await activeFallback.coordinator.flushPendingSaves()
  assert.equal(activeFallback.saves[0].filePath, 'active.ts')
  assert.equal(activeFallback.saves[0].dirtyPaths, undefined)

  const currentFallback = createHarness()
  currentFallback.setCurrentScopeFilePath('current.ts')
  currentFallback.coordinator.queueAll()
  await currentFallback.coordinator.flushPendingSaves()
  assert.equal(currentFallback.saves[0].filePath, 'current.ts')

  const treeFallback = createHarness()
  treeFallback.setBookmarks([
    { id: 'a', path: 'src/a.ts' },
    { id: 'b', path: 'src/b.ts' },
  ])
  treeFallback.coordinator.queueAll()
  await treeFallback.coordinator.flushPendingSaves()
  assert.deepEqual(treeFallback.saves.map(save => save.filePath), [
    'C:\\workspace\\src\\a.ts',
    'C:\\workspace\\src\\b.ts',
  ])

  const importIsolation = createHarness()
  const importResult = await importIsolation.coordinator.runImportTransaction(async () => {
    importIsolation.coordinator.queuePaths(['workspace:a.ts'])
    importIsolation.coordinator.queuePaths(['workspace:b.ts', 'workspace:a.ts'])
    assert.deepEqual(importIsolation.scheduling.timers, [])
    return 'imported'
  })
  assert.equal(importResult, 'imported')
  assert.deepEqual(importIsolation.scheduling.timers.map(timer => timer.delay), [500])
  await importIsolation.coordinator.flushPendingSaves()
  assert.deepEqual(importIsolation.saves[0].dirtyPaths, ['workspace:a.ts', 'workspace:b.ts'])

  const fullImportSave = createHarness()
  fullImportSave.setActiveFilePath('after-import.ts')
  await assert.rejects(fullImportSave.coordinator.runImportTransaction(async () => {
    fullImportSave.coordinator.queuePaths(['ignored.ts'])
    fullImportSave.coordinator.queueAll()
    throw new Error('import failed')
  }), /import failed/)
  await fullImportSave.coordinator.flushPendingSaves()
  assert.deepEqual(fullImportSave.saves.map(save => save.filePath), ['after-import.ts'])
  assert.equal(fullImportSave.saves[0].dirtyPaths, undefined)

  const transition = createHarness()
  transition.coordinator.beginStorageTransition()
  transition.coordinator.queuePaths(['deferred-a.ts'])
  transition.coordinator.queueAll()
  assert.deepEqual(transition.scheduling.timers, [])
  assert.equal(transition.coordinator.finishStorageTransition(), true)
  assert.equal(transition.coordinator.finishStorageTransition(), false)
  transition.coordinator.beginStorageTransition()
  transition.coordinator.queuePaths(['discarded.ts'])
  transition.coordinator.cancelStorageTransition()
  assert.equal(transition.coordinator.finishStorageTransition(), false)

  const unavailableStorage = createHarness()
  unavailableStorage.setStorageRoot(undefined)
  unavailableStorage.coordinator.queuePaths(['not-queued.ts'])
  assert.deepEqual(unavailableStorage.scheduling.timers, [])

  const forcedFailure = createHarness()
  forcedFailure.setSaveImplementation(async () => false)
  forcedFailure.coordinator.queuePaths(['failed.ts'])
  await assert.rejects(
    forcedFailure.coordinator.flushPendingSaves(true),
    /无法在转移存储目录前完整保存当前书签/,
  )
  assert.equal(forcedFailure.saves.length, 1)

  const retrying = createHarness()
  retrying.setSaveImplementation(async () => false)
  retrying.coordinator.queuePaths(['retry.ts'])
  assert.equal(await retrying.scheduling.runNext(), 500)
  assert.deepEqual(retrying.scheduling.timers.map(timer => timer.delay), [1000])
  assert.equal(await retrying.scheduling.runNext(), 1000)
  assert.deepEqual(retrying.scheduling.timers.map(timer => timer.delay), [2000])
  assert.equal(await retrying.scheduling.runNext(), 2000)
  assert.deepEqual(retrying.scheduling.timers, [])
  assert.equal(retrying.saves.length, 3)
  assert.equal(errorMessages.at(-1), '书签保存连续失败，已停止自动重试；请检查存储路径权限，内存中的书签仍可继续操作。')

  retrying.coordinator.queuePaths(['dispose.ts'])
  assert.equal(retrying.scheduling.timers.length, 1)
  retrying.coordinator.dispose()
  assert.deepEqual(retrying.scheduling.timers, [])
}

main().then(
  () => console.log('BookmarkSaveCoordinator contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
