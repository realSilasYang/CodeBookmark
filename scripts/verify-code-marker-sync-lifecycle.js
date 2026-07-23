/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-code-marker-sync-lifecycle`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-code-marker-sync-lifecycle` 对应契约。
 * 核心边界：通过断言锁定“verify-code-marker-sync-lifecycle”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`workspaceFile`、`uri`、`createHarness`、`flushAsyncWork`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { CodeMarkerSyncLifecycle } = require('../out/providers/CodeMarkerSyncLifecycle')

const workspacePath = path.resolve('workspace')

function workspaceFile(...segments) {
  return path.join(workspacePath, ...segments)
}

class FakeScheduling {
  constructor(events) {
    this.events = events
    this.timers = []
  }

  setTimer(callback, delay) {
    const timer = { callback, delay }
    this.timers.push(timer)
    this.events.push(`timer:${delay}`)
    return timer
  }

  clearTimer(timer) {
    const index = this.timers.indexOf(timer)
    if (index >= 0) this.timers.splice(index, 1)
    this.events.push('timer:clear')
  }

  runNext() {
    const timer = this.timers.shift()
    assert.ok(timer, 'Expected a scheduled code-marker task')
    timer.callback()
  }
}

function uri(filePath, scheme = 'file') {
  return { scheme, fsPath: path.resolve(filePath) }
}

function createHarness(options = {}) {
  const events = []
  const scheduling = new FakeScheduling(events)
  const lifecycle = new CodeMarkerSyncLifecycle(scheduling)
  let viewGeneration = options.viewGeneration ?? 1
  let loadingGeneration = options.loadingGeneration
  let storageScope = options.storageScope ?? `workspace:${workspacePath}`
  let globs = options.globs ?? ['**/*.ts']
  let profilesInitialized = options.profilesInitialized ?? true
  let supported = options.supported ?? true
  let currentScope = options.currentScope ?? true
  let removeResult = options.removeResult ?? true
  let synchronize = options.synchronize ?? (async () => {})
  let workspaceScan = options.workspaceScan ?? (async () => {})
  const watcherCallbacks = new Map()
  const port = {
    isFileUri: candidate => candidate.scheme === 'file',
    isExcluded: candidate => candidate.fsPath.includes('excluded'),
    profilesInitialized: () => profilesInitialized,
    supportsFile: () => supported,
    filePath: candidate => candidate.fsPath,
    currentViewGeneration: () => viewGeneration,
    isCurrentScope: () => currentScope,
    removeMarkers: candidate => {
      events.push(`remove:${candidate.fsPath}`)
      return removeResult
    },
    persistRemovedMarkers: candidate => { events.push(`persist:${candidate.fsPath}`) },
    synchronizeUris: async uris => {
      events.push(`sync:${uris.map(item => item.fsPath).join(',')}`)
      await synchronize(uris)
    },
    reportFileSyncFailure: (candidate, error) => { events.push(`fileFailure:${candidate.fsPath}:${error.message}`) },
    canWatchFiles: () => options.canWatchFiles ?? true,
    discoveryGlobs: () => globs,
    watchFilePattern: (glob, onCreate, onChange, onDelete) => {
      events.push(`watch:${glob}`)
      if (glob === '**/*.broken') throw new Error('watch failed')
      watcherCallbacks.set(glob, { onCreate, onChange, onDelete })
      return [{ dispose: () => events.push(`dispose:${glob}`) }]
    },
    reportWatcherFailure: (glob, error) => { events.push(`watchFailure:${glob}:${error.message}`) },
    loadingViewGeneration: () => loadingGeneration,
    currentStorageScope: () => storageScope,
    runWorkspaceScan: async (scope, generation) => {
      events.push(`workspaceScan:${scope}:${generation}`)
      await workspaceScan(scope, generation)
    },
    reportWorkspaceScanFailure: error => { events.push(`scanFailure:${error.message}`) },
  }
  return {
    events,
    lifecycle,
    port,
    scheduling,
    watcherCallbacks,
    setViewGeneration: value => { viewGeneration = value },
    setLoadingGeneration: value => { loadingGeneration = value },
    setStorageScope: value => { storageScope = value },
    setGlobs: value => { globs = value },
    setProfilesInitialized: value => { profilesInitialized = value },
    setSupported: value => { supported = value },
    setCurrentScope: value => { currentScope = value },
    setRemoveResult: value => { removeResult = value },
    setSynchronize: value => { synchronize = value },
    setWorkspaceScan: value => { workspaceScan = value },
  }
}

async function flushAsyncWork() {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

async function main() {
  const ignored = createHarness()
  ignored.lifecycle.scheduleFileSync(uri(workspaceFile('virtual.ts'), 'untitled'), false, ignored.port)
  ignored.lifecycle.scheduleFileSync(uri(workspaceFile('excluded.ts')), false, ignored.port)
  ignored.setSupported(false)
  ignored.lifecycle.scheduleFileSync(uri(workspaceFile('unsupported.txt')), false, ignored.port)
  assert.deepEqual(ignored.events, [])

  const debounced = createHarness()
  const sourceUri = uri(workspaceFile('source.ts'))
  debounced.lifecycle.scheduleFileSync(sourceUri, false, debounced.port)
  debounced.lifecycle.scheduleFileSync(sourceUri, false, debounced.port)
  assert.equal(debounced.scheduling.timers.length, 1)
  assert.deepEqual(debounced.events, ['timer:250', 'timer:clear', 'timer:250'])
  debounced.scheduling.runNext()
  await flushAsyncWork()
  assert.equal(debounced.events.at(-1), `sync:${sourceUri.fsPath}`)

  const stale = createHarness()
  stale.lifecycle.scheduleFileSync(sourceUri, false, stale.port)
  stale.setViewGeneration(2)
  stale.scheduling.runNext()
  await flushAsyncWork()
  assert.equal(stale.events.some(event => event.startsWith('sync:')), false)

  const deleted = createHarness()
  deleted.lifecycle.scheduleFileSync(sourceUri, true, deleted.port)
  deleted.scheduling.runNext()
  await flushAsyncWork()
  assert.deepEqual(deleted.events.slice(-2), [`remove:${sourceUri.fsPath}`, `persist:${sourceUri.fsPath}`])
  deleted.setRemoveResult(false)
  deleted.lifecycle.scheduleFileSync(sourceUri, true, deleted.port)
  deleted.scheduling.runNext()
  await flushAsyncWork()
  assert.equal(deleted.events.filter(event => event.startsWith('persist:')).length, 1)

  const failedFileSync = createHarness({ synchronize: async () => { throw new Error('sync failed') } })
  failedFileSync.lifecycle.scheduleFileSync(sourceUri, false, failedFileSync.port)
  failedFileSync.scheduling.runNext()
  await flushAsyncWork()
  assert.equal(failedFileSync.events.at(-1), `fileFailure:${sourceUri.fsPath}:sync failed`)

  const cancelledPath = createHarness()
  const nestedUri = uri(workspaceFile('folder', 'nested.ts'))
  const otherUri = uri(workspaceFile('other.ts'))
  cancelledPath.lifecycle.scheduleFileSync(nestedUri, false, cancelledPath.port)
  cancelledPath.lifecycle.scheduleFileSync(otherUri, false, cancelledPath.port)
  cancelledPath.lifecycle.cancelPath(path.dirname(nestedUri.fsPath))
  assert.equal(cancelledPath.scheduling.timers.length, 1)

  const watchers = createHarness({ globs: ['**/*.ts', '**/*.js'] })
  watchers.lifecycle.setupFileWatchers(watchers.port)
  watchers.lifecycle.setupFileWatchers(watchers.port)
  assert.deepEqual(watchers.events, ['watch:**/*.ts', 'watch:**/*.js'])
  watchers.watcherCallbacks.get('**/*.ts').onDelete(sourceUri)
  assert.equal(watchers.scheduling.timers.length, 1)
  watchers.setGlobs(['**/*.py', '**/*.broken'])
  watchers.lifecycle.setupFileWatchers(watchers.port)
  assert.ok(watchers.events.includes('dispose:**/*.ts'))
  assert.ok(watchers.events.includes('dispose:**/*.js'))
  assert.ok(watchers.events.includes('watchFailure:**/*.broken:watch failed'))

  const workspaceScope = `workspace:${workspacePath}`
  const workspace = createHarness({ storageScope: workspaceScope })
  workspace.lifecycle.scheduleWorkspaceScan(workspace.port)
  assert.equal(workspace.lifecycle.currentWorkspaceScanGeneration, 1)
  workspace.scheduling.runNext()
  await flushAsyncWork()
  assert.ok(workspace.events.includes(`workspaceScan:${workspaceScope}:1`))
  workspace.lifecycle.markWorkspaceScanCompleted(workspaceScope)
  workspace.lifecycle.scheduleWorkspaceScan(workspace.port)
  assert.equal(workspace.scheduling.timers.length, 0)
  workspace.lifecycle.invalidateWorkspaceScanScope()
  workspace.lifecycle.scheduleWorkspaceScan(workspace.port)
  assert.equal(workspace.lifecycle.currentWorkspaceScanGeneration, 2)

  const loading = createHarness({ loadingGeneration: 4 })
  loading.lifecycle.scheduleWorkspaceScan(loading.port)
  assert.equal(loading.scheduling.timers.length, 0)
  loading.setLoadingGeneration(undefined)
  loading.setStorageScope(`file:${path.resolve('script.ts')}`)
  loading.lifecycle.scheduleWorkspaceScan(loading.port)
  assert.equal(loading.scheduling.timers.length, 0)

  const failedScan = createHarness({ workspaceScan: async () => { throw new Error('scan failed') } })
  failedScan.lifecycle.scheduleWorkspaceScan(failedScan.port)
  failedScan.scheduling.runNext()
  await flushAsyncWork()
  assert.equal(failedScan.events.at(-1), 'scanFailure:scan failed')

  const disposed = createHarness({ globs: ['**/*.ts'] })
  disposed.lifecycle.setupFileWatchers(disposed.port)
  disposed.lifecycle.scheduleFileSync(sourceUri, false, disposed.port)
  disposed.lifecycle.scheduleWorkspaceScan(disposed.port)
  disposed.lifecycle.dispose()
  assert.equal(disposed.scheduling.timers.length, 0)
  assert.ok(disposed.events.includes('dispose:**/*.ts'))
}

main().then(
  () => console.log('CodeMarkerSyncLifecycle contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
