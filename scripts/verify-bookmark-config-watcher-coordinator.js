/**
 * 验证配置监听器替换、事件合并、过期请求丢弃和失败分类，旧根目录回调不能污染新视图。
 * 脚本直接调用编译后的 `BookmarkConfigWatcherCoordinator`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { BookmarkConfigWatcherCoordinator } = require('../out/providers/BookmarkConfigWatcherCoordinator')
const { flushAsyncWork } = require('./test-support/async-work')
const { ManualScheduler } = require('./test-support/manual-scheduler')

function createHarness() {
  const events = []
  const scheduling = new ManualScheduler(events)
  const coordinator = new BookmarkConfigWatcherCoordinator(scheduling)
  const handles = []
  const state = {
    disposed: false,
    generation: 1,
    scope: 'workspace:current',
    saving: false,
    collected: [],
    layoutReloader: undefined,
  }
  const port = {
    isDisposed: () => state.disposed,
    currentGeneration: () => state.generation,
    currentScope: () => state.scope,
    watchDirectories: () => ({ scriptFolder: 'C:/scripts', workspaceFolder: 'C:/workspace' }),
    isSaving: () => state.saving,
    collectExternalChanges: async directory => {
      events.push(`collect:${directory}`)
      return state.collected
    },
    hasExternalChange: async (directory, filename) => {
      events.push(`changed:${directory}:${filename}`)
      return true
    },
    sameDirectory: (left, right) => left.toLowerCase() === right.toLowerCase(),
    reloadWorkspaceLayout: async () => {
      events.push('layout:reload')
      if (state.layoutReloader) return state.layoutReloader()
    },
    reloadExternalBookmarkFiles: async fileNames => {
      events.push(`reload:${fileNames.join(',')}`)
    },
    rebasePendingSaves: () => { events.push('rebase') },
    isDirectory: async directory => {
      events.push(`stat:${directory}`)
      return true
    },
    rememberDirectory: async directory => { events.push(`remember:${directory}`) },
    watchDirectory: (directory, onFileChange, onError) => {
      events.push(`watch:${directory}`)
      const handle = {
        directory,
        onFileChange,
        onError,
        close: () => events.push(`close:${directory}`),
      }
      handles.push(handle)
      return handle
    },
    reportFailure: (kind, error, directory) => {
      events.push(`failure:${kind}:${directory ?? 'none'}:${error.message}`)
    },
  }
  return { coordinator, events, handles, port, scheduling, state }
}

async function main() {
  const changes = createHarness()
  await changes.coordinator.setup(1, changes.port)
  assert.equal(changes.handles.length, 2)
  changes.handles[0].onFileChange('ignored.txt')
  assert.equal(changes.scheduling.timers.length, 0)
  changes.handles[0].onFileChange('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json')
  changes.handles[1].onFileChange('_workspace_order.json')
  assert.equal(changes.scheduling.timers.filter(timer => timer.delay === 500).length, 1)
  changes.scheduling.runDelay(500)
  await flushAsyncWork()
  assert.ok(changes.events.includes('layout:reload'))
  assert.equal(changes.events.some(event => event.startsWith('reload:')), false)

  const deferred = createHarness()
  await deferred.coordinator.setup(1, deferred.port)
  deferred.state.saving = true
  deferred.handles[0].onFileChange('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json')
  deferred.scheduling.runDelay(500)
  await flushAsyncWork()
  assert.equal(deferred.scheduling.timers.some(timer => timer.delay === 100), true)
  assert.equal(deferred.events.some(event => event.startsWith('reload:')), false)
  deferred.state.saving = false
  deferred.scheduling.runDelay(100)
  await flushAsyncWork()
  assert.ok(deferred.events.includes('reload:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json'))

  const collected = createHarness()
  collected.state.collected = ['cccccccc-cccc-cccc-cccc-cccccccccccc.json']
  await collected.coordinator.setup(1, collected.port)
  collected.handles[0].onFileChange(null)
  collected.scheduling.runDelay(500)
  await flushAsyncWork()
  assert.ok(collected.events.includes('collect:C:/scripts'))
  assert.ok(collected.events.includes('reload:cccccccc-cccc-cccc-cccc-cccccccccccc.json'))

  const stale = createHarness()
  await stale.coordinator.setup(1, stale.port)
  stale.handles[0].onFileChange('dddddddd-dddd-dddd-dddd-dddddddddddd.json')
  stale.state.generation = 2
  stale.scheduling.runDelay(500)
  await flushAsyncWork()
  assert.equal(stale.events.some(event => event.startsWith('reload:')), false)

  const staleOrder = createHarness()
  let releaseOrder
  staleOrder.state.layoutReloader = () => new Promise(resolve => { releaseOrder = resolve })
  await staleOrder.coordinator.setup(1, staleOrder.port)
  staleOrder.handles[1].onFileChange('_workspace_order.json')
  staleOrder.scheduling.runDelay(500)
  await flushAsyncWork()
  staleOrder.state.generation = 2
  releaseOrder()
  await flushAsyncWork()
  assert.equal(staleOrder.events.filter(event => event === 'layout:reload').length, 1)

  const delayedFailure = createHarness()
  delayedFailure.state.saving = true
  delayedFailure.state.layoutReloader = async () => { throw new Error('layout failed') }
  await delayedFailure.coordinator.setup(1, delayedFailure.port)
  delayedFailure.handles[1].onFileChange('_workspace_order.json')
  delayedFailure.scheduling.runDelay(500)
  await flushAsyncWork()
  delayedFailure.state.saving = false
  delayedFailure.scheduling.runDelay(100)
  await flushAsyncWork()
  assert.ok(delayedFailure.events.includes('failure:delayed-processing:none:layout failed'))

  const retry = createHarness()
  await retry.coordinator.setup(1, retry.port)
  retry.handles[0].onError(new Error('watch failed'))
  assert.ok(retry.events.includes('failure:watcher:C:/scripts:watch failed'))
  retry.scheduling.runDelay(1000)
  await flushAsyncWork()
  assert.equal(retry.handles.length, 4)
  assert.ok(retry.events.includes('close:C:/scripts'))
  assert.ok(retry.events.includes('close:C:/workspace'))

  const staleRetry = createHarness()
  await staleRetry.coordinator.setup(1, staleRetry.port)
  staleRetry.handles[0].onError(new Error('watch failed'))
  staleRetry.state.scope = 'workspace:next'
  staleRetry.scheduling.runDelay(1000)
  await flushAsyncWork()
  assert.equal(staleRetry.handles.length, 2)

  const disposed = createHarness()
  await disposed.coordinator.setup(1, disposed.port)
  disposed.handles[0].onFileChange('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.json')
  disposed.handles[0].onError(new Error('watch failed'))
  disposed.state.disposed = true
  disposed.coordinator.dispose()
  assert.equal(disposed.scheduling.timers.length, 0)
  assert.ok(disposed.events.includes('close:C:/scripts'))
  assert.ok(disposed.events.includes('close:C:/workspace'))

  const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
  assert.match(provider, /return this\.configWatcherCoordinator\.setup\(generation, this\.configWatcherCoordinatorPort\(\)\)/)
  assert.match(provider, /this\.configWatcherCoordinator\.closeWatchers\(\)/)
  assert.match(provider, /this\.configWatcherCoordinator\.dispose\(\)/)
  assert.doesNotMatch(provider, /configWatcherDebounceTimer|new ConfigWatcherLifecycle/)
}

main().then(
  () => console.log('BookmarkConfigWatcherCoordinator contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
