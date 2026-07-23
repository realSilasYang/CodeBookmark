/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-view-refresh-coordinator`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-view-refresh-coordinator` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-view-refresh-coordinator”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`fileEditor`、`createHarness`、`runScheduledRefresh`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')

const { BookmarkViewRefreshCoordinator } = require('../out/providers/BookmarkViewRefreshCoordinator')

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
    assert.ok(timer, 'Expected a scheduled refresh')
    timer.callback()
  }
}

function fileEditor(filePath) {
  return { document: { uri: { scheme: 'file', fsPath: filePath } } }
}

function createHarness(options = {}) {
  const events = []
  const scheduling = new FakeScheduling(events)
  const coordinator = new BookmarkViewRefreshCoordinator(scheduling)
  let generation = options.generation ?? 0
  let revealGeneration = 0
  let loadingGeneration = options.loadingGeneration
  let currentStorageScope = options.currentStorageScope
  let currentScopeFilePath = options.currentScopeFilePath
  let workspaceRoot = options.workspaceRoot
  let treeVisible = options.treeVisible ?? true
  let isCurrentOverride = options.isCurrent
  let queueContexts = options.queueContexts ?? (() => Promise.resolve())
  let initView = options.initView ?? (async (_scopePath, _candidateGeneration, storageScope) => {
    currentStorageScope = storageScope
  })

  const port = {
    currentStorageScope: () => currentStorageScope,
    currentScopeFilePath: () => currentScopeFilePath,
    setCurrentScopeFilePath: filePath => {
      currentScopeFilePath = filePath
      events.push(`scopePath:set:${filePath}`)
    },
    workspaceRoot: () => workspaceRoot,
    nextRevealGeneration: () => {
      revealGeneration++
      events.push(`revealGeneration:${revealGeneration}`)
      return revealGeneration
    },
    beginViewLoad: () => {
      generation++
      events.push(`begin:${generation}`)
      return generation
    },
    currentViewLoadGeneration: () => generation,
    loadingViewGeneration: () => loadingGeneration,
    clearLoading: () => {
      loadingGeneration = undefined
      events.push('loading:clear')
    },
    markLoading: candidateGeneration => {
      loadingGeneration = candidateGeneration
      events.push(`loading:${candidateGeneration}`)
    },
    resetCodeMarkerScan: () => { events.push('scan:reset') },
    queueBookmarkPresenceContexts: async () => {
      events.push('contexts')
      await queueContexts()
    },
    restoreConfigWatcher: candidateGeneration => { events.push(`watcher:${candidateGeneration}`) },
    restoreBackgroundEnhancements: candidateGeneration => { events.push(`background:${candidateGeneration}`) },
    scheduleActiveFileReveal: (_editor, viewGeneration, candidateRevealGeneration) => {
      events.push(`reveal:${viewGeneration}:${candidateRevealGeneration}`)
    },
    initView: async (scopePath, candidateGeneration, storageScope) => {
      events.push(`init:${scopePath ?? 'none'}:${candidateGeneration}:${storageScope}`)
      await initView(scopePath, candidateGeneration, storageScope)
    },
    isCurrent: (candidateGeneration, storageScope) => isCurrentOverride
      ? isCurrentOverride(candidateGeneration, storageScope)
      : candidateGeneration === generation && storageScope === currentStorageScope,
    treeVisible: () => treeVisible,
    reportRefreshFailure: error => { events.push(`failure:${error.message}`) },
  }

  return {
    coordinator,
    events,
    port,
    scheduling,
    generation: () => generation,
    currentScopeFilePath: () => currentScopeFilePath,
    setQueueContexts: value => { queueContexts = value },
    setInitView: value => { initView = value },
    setIsCurrent: value => { isCurrentOverride = value },
    setTreeVisible: value => { treeVisible = value },
  }
}

async function runScheduledRefresh(harness, editor, storageScope, forceReloadDisk = true) {
  const operation = harness.coordinator.refresh(editor, storageScope, forceReloadDisk, harness.port)
  assert.equal(harness.scheduling.timers.length, 1)
  harness.scheduling.runNext()
  await operation
}

async function main() {
  const full = createHarness({ currentStorageScope: 'workspace:old', workspaceRoot: 'C:\\workspace' })
  const activeEditor = fileEditor('C:\\workspace\\src\\active.ts')
  await runScheduledRefresh(full, activeEditor, 'workspace:new')
  assert.deepEqual(full.events, [
    'revealGeneration:1',
    'begin:1',
    'loading:1',
    'scan:reset',
    'timer:100',
    'init:C:\\workspace\\src\\active.ts:1:workspace:new',
    'reveal:1:1',
  ])
  assert.equal(full.generation(), 1)

  const fast = createHarness({
    generation: 4,
    currentStorageScope: 'workspace:current',
    currentScopeFilePath: 'C:\\workspace\\old.ts',
  })
  await fast.coordinator.refresh(activeEditor, 'workspace:current', false, fast.port)
  assert.deepEqual(fast.events, [
    'revealGeneration:1',
    'scopePath:set:C:\\workspace\\src\\active.ts',
    'contexts',
    'reveal:4:1',
  ])
  assert.equal(fast.generation(), 4)
  assert.equal(fast.currentScopeFilePath(), 'C:\\workspace\\src\\active.ts')

  const cancelled = createHarness({ currentStorageScope: 'workspace:current' })
  const delayedRefresh = cancelled.coordinator.refresh(activeEditor, 'workspace:current', true, cancelled.port)
  let releaseContexts
  cancelled.setQueueContexts(() => new Promise(resolve => { releaseContexts = resolve }))
  const fastRefresh = cancelled.coordinator.refresh(activeEditor, 'workspace:current', false, cancelled.port)
  await delayedRefresh
  assert.equal(cancelled.generation(), 2)
  assert.equal(cancelled.scheduling.timers.length, 0)
  assert.deepEqual(cancelled.events.slice(0, 11), [
    'revealGeneration:1',
    'begin:1',
    'loading:1',
    'scan:reset',
    'timer:100',
    'revealGeneration:2',
    'begin:2',
    'loading:clear',
    'timer:clear',
    'scopePath:set:C:\\workspace\\src\\active.ts',
    'contexts',
  ])
  releaseContexts()
  await fastRefresh
  assert.deepEqual(cancelled.events.slice(11), ['watcher:2', 'background:2', 'reveal:2:2'])

  const loadingOnly = createHarness({
    generation: 7,
    loadingGeneration: 7,
    currentStorageScope: 'standalone:file',
  })
  await loadingOnly.coordinator.refresh(undefined, 'standalone:file', false, loadingOnly.port)
  assert.deepEqual(loadingOnly.events, [
    'revealGeneration:1',
    'begin:8',
    'loading:clear',
    'contexts',
    'watcher:8',
    'background:8',
  ])
  assert.equal(loadingOnly.generation(), 8)

  const scopePathFallback = createHarness({
    currentStorageScope: 'standalone:file',
    currentScopeFilePath: 'C:\\scripts\\remembered.ts',
  })
  await runScheduledRefresh(scopePathFallback, undefined, 'standalone:file')
  assert.ok(scopePathFallback.events.includes('init:C:\\scripts\\remembered.ts:1:standalone:file'))

  const workspaceFallback = createHarness({
    currentStorageScope: 'standalone:file',
    currentScopeFilePath: 'C:\\scripts\\ignored.ts',
    workspaceRoot: 'C:\\workspace',
  })
  await runScheduledRefresh(workspaceFallback, undefined, 'workspace:new')
  assert.ok(workspaceFallback.events.includes('init:C:\\workspace:1:workspace:new'))

  const failed = createHarness({ currentStorageScope: 'workspace:old' })
  failed.setInitView(async () => { throw new Error('load failed') })
  await runScheduledRefresh(failed, activeEditor, 'workspace:new')
  assert.ok(failed.events.includes('failure:load failed'))
  assert.equal(failed.events.some(event => event.startsWith('reveal:')), false)

  const stale = createHarness({ currentStorageScope: 'workspace:old' })
  stale.setIsCurrent(() => false)
  await runScheduledRefresh(stale, activeEditor, 'workspace:new')
  assert.equal(stale.events.some(event => event.startsWith('reveal:')), false)

  const hidden = createHarness({ currentStorageScope: 'workspace:old', treeVisible: false })
  await runScheduledRefresh(hidden, activeEditor, 'workspace:new')
  assert.equal(hidden.events.some(event => event.startsWith('reveal:')), false)

  const disposed = createHarness({ currentStorageScope: 'workspace:old' })
  const disposedRefresh = disposed.coordinator.refresh(activeEditor, 'workspace:new', true, disposed.port)
  assert.equal(disposed.scheduling.timers.length, 1)
  disposed.coordinator.dispose()
  await disposedRefresh
  assert.equal(disposed.scheduling.timers.length, 0)
  assert.equal(disposed.events.some(event => event.startsWith('init:')), false)
}

main().then(
  () => console.log('BookmarkViewRefreshCoordinator contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
