const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const informationMessages = []
const errorMessages = []
const { vscode } = createVscodeFake({
  window: {
    showInformationMessage: message => { informationMessages.push(message) },
    showErrorMessage: message => { errorMessages.push(message) },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { BookmarkStoragePathWorkflowRunner } = require('../out/providers/BookmarkStoragePathWorkflowRunner')
restoreModules()

function createHarness(options = {}) {
  const events = []
  let activeRoot = options.activeRoot
  let configured = options.configured ?? true
  let configuredRoot = options.configuredRoot ?? 'C:\\bookmarks\\target'
  let deferredSave = options.deferredSave ?? false
  let rememberRoot = options.rememberRoot ?? (async () => {})
  let reloadActiveTab = options.reloadActiveTab ?? (async () => {})
  let flushPendingSaves = options.flushPendingSaves ?? (async () => {})
  let transferRoot = options.transferRoot ?? (async () => ({ copiedFiles: 3, mergedFiles: 2, conflictFiles: 1 }))
  let setupConfigWatcher = options.setupConfigWatcher ?? (async () => {})

  const port = {
    activeRoot: () => {
      events.push(`active:${activeRoot ?? 'none'}`)
      return activeRoot
    },
    ensureConfigured: () => {
      events.push(`configured:${configured}`)
      return configured
    },
    configuredRoot: () => {
      events.push(`target:${configuredRoot}`)
      return configuredRoot
    },
    sameRoot: (left, right) => {
      events.push(`same:${left}:${right}`)
      return left.toLowerCase() === right.toLowerCase()
    },
    activateRoot: root => {
      activeRoot = root
      events.push(`activate:${root}`)
    },
    rememberRoot: async root => {
      events.push(`remember:${root}`)
      await rememberRoot(root)
    },
    reloadActiveTab: async forceReloadDisk => {
      events.push(`reload:${forceReloadDisk}`)
      await reloadActiveTab(forceReloadDisk)
    },
    queueFullSave: () => { events.push('save:queue') },
    beginStorageTransition: () => { events.push('transition:begin') },
    finishStorageTransition: () => {
      events.push(`transition:finish:${deferredSave}`)
      const result = deferredSave
      deferredSave = false
      return result
    },
    cancelStorageTransition: () => { events.push('transition:cancel') },
    flushPendingSaves: async requireSuccess => {
      events.push(`save:flush:${requireSuccess === true ? 'required' : 'normal'}`)
      await flushPendingSaves(requireSuccess)
    },
    transferRoot: async (source, target) => {
      events.push(`transfer:${source}:${target}`)
      return transferRoot(source, target)
    },
    setupConfigWatcher: async () => {
      events.push('watcher:setup')
      await setupConfigWatcher()
    },
    reportPreviousFailure: error => { events.push(`previous:${error.message}`) },
    bookmarks: () => options.bookmarks ?? [],
  }

  return {
    events,
    port,
    setActiveRoot: value => { activeRoot = value },
    setConfigured: value => { configured = value },
    setConfiguredRoot: value => { configuredRoot = value },
    setDeferredSave: value => { deferredSave = value },
    setRememberRoot: value => { rememberRoot = value },
    setReloadActiveTab: value => { reloadActiveTab = value },
    setFlushPendingSaves: value => { flushPendingSaves = value },
    setTransferRoot: value => { transferRoot = value },
  }
}

async function main() {
  const unconfigured = createHarness({ activeRoot: 'C:\\bookmarks\\source', configured: false })
  await new BookmarkStoragePathWorkflowRunner().run(unconfigured.port)
  assert.deepEqual(unconfigured.events, ['active:C:\\bookmarks\\source', 'configured:false'])

  const firstActivation = createHarness({ activeRoot: undefined })
  await new BookmarkStoragePathWorkflowRunner().run(firstActivation.port)
  assert.deepEqual(firstActivation.events, [
    'active:none',
    'configured:true',
    'target:C:\\bookmarks\\target',
    'activate:C:\\bookmarks\\target',
    'remember:C:\\bookmarks\\target',
    'reload:true',
  ])

  const sameRoot = createHarness({
    activeRoot: 'C:\\Bookmarks\\Target',
    configuredRoot: 'c:\\bookmarks\\target',
  })
  await new BookmarkStoragePathWorkflowRunner().run(sameRoot.port)
  assert.deepEqual(sameRoot.events, [
    'active:C:\\Bookmarks\\Target',
    'configured:true',
    'target:c:\\bookmarks\\target',
    'same:C:\\Bookmarks\\Target:c:\\bookmarks\\target',
  ])

  informationMessages.length = 0
  const successful = createHarness({ activeRoot: 'C:\\bookmarks\\source' })
  await new BookmarkStoragePathWorkflowRunner().run(successful.port)
  assert.deepEqual(successful.events, [
    'active:C:\\bookmarks\\source',
    'configured:true',
    'target:C:\\bookmarks\\target',
    'same:C:\\bookmarks\\source:C:\\bookmarks\\target',
    'save:queue',
    'transition:begin',
    'save:flush:required',
    'transfer:C:\\bookmarks\\source:C:\\bookmarks\\target',
    'activate:C:\\bookmarks\\target',
    'remember:C:\\bookmarks\\target',
    'transition:finish:false',
    'reload:true',
  ])
  assert.equal(
    informationMessages.at(-1),
    '书签存储目录转移完成：复制 3 个文件，合并 2 个文件，保留 1 个冲突副本；当前结果：共 0 个书签。来源目录已保留作为备份。',
  )

  const deferred = createHarness({ activeRoot: 'C:\\bookmarks\\source', deferredSave: true })
  await new BookmarkStoragePathWorkflowRunner().run(deferred.port)
  assert.deepEqual(deferred.events.slice(8), [
    'activate:C:\\bookmarks\\target',
    'remember:C:\\bookmarks\\target',
    'transition:finish:true',
    'save:queue',
    'save:flush:required',
    'reload:true',
  ])

  errorMessages.length = 0
  const failed = createHarness({
    activeRoot: 'C:\\bookmarks\\source',
    transferRoot: async () => { throw new Error('copy failed') },
  })
  await new BookmarkStoragePathWorkflowRunner().run(failed.port)
  assert.deepEqual(failed.events.slice(4), [
    'save:queue',
    'transition:begin',
    'save:flush:required',
    'transfer:C:\\bookmarks\\source:C:\\bookmarks\\target',
    'activate:C:\\bookmarks\\source',
    'transition:cancel',
    'save:queue',
    'save:flush:normal',
    'watcher:setup',
  ])
  assert.equal(errorMessages.at(-1), '书签存储目录转移失败，仍继续使用来源目录：copy failed')

  const serialized = createHarness({ activeRoot: undefined })
  let releaseRemember
  serialized.setRememberRoot(() => new Promise(resolve => { releaseRemember = resolve }))
  const serializedRunner = new BookmarkStoragePathWorkflowRunner()
  const first = serializedRunner.run(serialized.port)
  const second = serializedRunner.run(serialized.port)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(serialized.events.filter(event => event.startsWith('active:')).length, 1)
  releaseRemember()
  await Promise.all([first, second])
  assert.equal(serialized.events.filter(event => event.startsWith('active:')).length, 2)

  const recoveredQueue = createHarness({ activeRoot: undefined })
  let failRemember = true
  recoveredQueue.setRememberRoot(async () => {
    if (failRemember) {
      failRemember = false
      throw new Error('state write failed')
    }
  })
  const recoveredRunner = new BookmarkStoragePathWorkflowRunner()
  await assert.rejects(recoveredRunner.run(recoveredQueue.port), /state write failed/)
  recoveredQueue.setConfigured(false)
  await recoveredRunner.run(recoveredQueue.port)
  assert.ok(recoveredQueue.events.includes('previous:state write failed'))
  assert.deepEqual(recoveredQueue.events.slice(-3), [
    'previous:state write failed',
    'active:C:\\bookmarks\\target',
    'configured:false',
  ])
}

main().then(
  () => console.log('BookmarkStoragePathWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
