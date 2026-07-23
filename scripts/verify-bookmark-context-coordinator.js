/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-context-coordinator`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-context-coordinator` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-context-coordinator”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`fileUri`、`createHarness`、`flushAsyncWork`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { Commands } = require('../out/util/constants/Commands')
const { BookmarkContextCoordinator } = require('../out/providers/BookmarkContextCoordinator')

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
    assert.ok(timer, 'Expected a scheduled context update')
    timer.callback()
  }
}

function fileUri(filePath) {
  return { fsPath: filePath, key: `file:${filePath}` }
}

function createHarness(options = {}) {
  const events = []
  const scheduling = new FakeScheduling(events)
  const coordinator = new BookmarkContextCoordinator(scheduling, 100)
  let activeEditor = options.activeEditor
  let activeTab = options.activeTab
	let workspaceFolderDirectory = options.workspaceFolderDirectory
  let bookmarkCount = options.bookmarkCount ?? 0
  let folderScan = options.folderScan ?? (async () => ({
    hasBookmarkedScript: false,
    hasUnbookmarkedScript: false,
  }))
  let setContext = options.setContext ?? (async () => {})
  const bookmarkedUris = new Set(options.bookmarkedUris ?? [])
  const port = {
    setContext: async (key, value) => {
      events.push(`context:${key}:${value}`)
      await setContext(key, value)
    },
    activeEditorFileUri: () => activeEditor,
    activeTabFileUri: () => activeTab,
		workspaceFolderDirectory: () => workspaceFolderDirectory,
    isCurrentScope: uri => !uri.fsPath.includes('other-scope'),
    uriKey: uri => uri.key,
    filePath: uri => uri.fsPath,
    currentBookmarkCount: () => bookmarkCount,
    hasBookmarksForUri: uri => bookmarkedUris.has(uri.key),
    folderBookmarkPresence: async directory => {
      events.push(`folder:${directory}`)
      return folderScan(directory)
    },
    reportFailure: (kind, error) => { events.push(`failure:${kind}:${error.message}`) },
  }
  return {
    coordinator,
    events,
    port,
    scheduling,
    setActiveEditor: value => { activeEditor = value },
    setActiveTab: value => { activeTab = value },
		setWorkspaceFolderDirectory: value => { workspaceFolderDirectory = value },
    setBookmarkCount: value => { bookmarkCount = value },
    setFolderScan: value => { folderScan = value },
    setSetContext: value => { setContext = value },
  }
}

async function flushAsyncWork() {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

async function main() {
  const active = fileUri('C:\\workspace\\src\\active.ts')
  const direct = createHarness({
    activeEditor: active,
    bookmarkCount: 3,
    bookmarkedUris: [active.key],
    folderScan: async () => ({ hasBookmarkedScript: true, hasUnbookmarkedScript: true }),
  })
  await direct.coordinator.queuePresenceContexts(direct.port)
  await flushAsyncWork()
  assert.ok(direct.events.includes(`context:${Commands.varHasBookmark}:true`))
	assert.ok(direct.events.includes(`context:${Commands.varActiveFileAvailable}:true`))
  assert.ok(direct.events.includes(`context:${Commands.varActiveFileHasBookmark}:true`))
  assert.ok(direct.events.includes(`context:${Commands.varAIAnalysisAvailable}:true`))
  assert.ok(direct.events.includes(`context:${Commands.varCurrentFolderHasUnbookmarkedScript}:false`))
  assert.ok(direct.events.includes(`context:${Commands.varCurrentFolderHasBookmarkedScript}:false`))
  assert.ok(direct.events.includes(`context:${Commands.varCurrentFolderHasUnbookmarkedScript}:true`))
  assert.ok(direct.events.includes(`context:${Commands.varCurrentFolderHasBookmarkedScript}:true`))

  const noFile = createHarness()
  await noFile.coordinator.queuePresenceContexts(noFile.port)
  assert.deepEqual(noFile.events, ['timer:100'])
  noFile.scheduling.runNext()
  await flushAsyncWork()
  assert.ok(noFile.events.includes(`context:${Commands.varAIAnalysisAvailable}:false`))
	assert.ok(noFile.events.includes(`context:${Commands.varActiveFileAvailable}:false`))

  const tabFallback = createHarness({
		activeTab: active,
		bookmarkCount: 1,
		bookmarkedUris: [active.key],
		folderScan: async () => ({ hasBookmarkedScript: true, hasUnbookmarkedScript: true }),
	})
  await tabFallback.coordinator.queuePresenceContexts(tabFallback.port)
  await flushAsyncWork()
  assert.ok(tabFallback.events.includes(`context:${Commands.varAIAnalysisAvailable}:true`))
	assert.ok(tabFallback.events.includes(`context:${Commands.varActiveFileAvailable}:true`))
	assert.ok(tabFallback.events.includes(`context:${Commands.varCurrentFolderHasUnbookmarkedScript}:true`))
	assert.ok(tabFallback.events.includes(`context:${Commands.varCurrentFolderHasBookmarkedScript}:true`))

	const workspaceNoFile = createHarness({
		workspaceFolderDirectory: 'C:\\workspace',
		folderScan: async () => ({ hasBookmarkedScript: true, hasUnbookmarkedScript: true }),
	})
	await workspaceNoFile.coordinator.queuePresenceContexts(workspaceNoFile.port)
	await flushAsyncWork()
	assert.equal(workspaceNoFile.scheduling.timers.length, 0)
	assert.ok(workspaceNoFile.events.includes(`context:${Commands.varActiveFileAvailable}:false`))
	assert.ok(workspaceNoFile.events.includes(`context:${Commands.varAIAnalysisAvailable}:true`))
	assert.ok(workspaceNoFile.events.includes('folder:C:\\workspace'))
	assert.ok(workspaceNoFile.events.includes(`context:${Commands.varCurrentFolderHasBookmarkedScript}:true`))
	assert.ok(workspaceNoFile.events.includes(`context:${Commands.varCurrentFolderHasUnbookmarkedScript}:true`))

  const editorTransition = createHarness()
  editorTransition.coordinator.handleActiveEditorChanged(undefined, true, editorTransition.port)
  assert.equal(editorTransition.scheduling.timers.length, 1)
  editorTransition.setActiveEditor(active)
  editorTransition.coordinator.handleActiveEditorChanged(active, true, editorTransition.port)
  await flushAsyncWork()
  assert.equal(editorTransition.scheduling.timers.length, 0)
  assert.ok(editorTransition.events.includes('timer:clear'))
  assert.ok(editorTransition.events.includes(`context:${Commands.varAIAnalysisAvailable}:true`))

	const outsideScope = fileUri('C:\\other-scope\\outside.ts')
	const outsideScopeEditor = createHarness({
		activeEditor: outsideScope,
		bookmarkedUris: [outsideScope.key],
	})
	outsideScopeEditor.coordinator.handleActiveEditorChanged(outsideScope, true, outsideScopeEditor.port)
	await flushAsyncWork()
	assert.ok(outsideScopeEditor.events.includes(`context:${Commands.varAIAnalysisAvailable}:true`))
	assert.ok(outsideScopeEditor.events.includes(`context:${Commands.varActiveFileHasBookmark}:false`))
	assert.equal(outsideScopeEditor.events.some(event => event.startsWith('folder:')), false)

  const tabChange = createHarness()
  await tabChange.coordinator.queuePresenceContexts(tabChange.port)
  tabChange.setActiveTab(active)
  tabChange.coordinator.handleTabsChanged(tabChange.port)
  await flushAsyncWork()
  assert.equal(tabChange.scheduling.timers.length, 0)
  assert.ok(tabChange.events.includes('timer:clear'))

  const staleFolder = createHarness({ activeEditor: active })
  let releaseFirstScan
  staleFolder.setFolderScan(() => new Promise(resolve => { releaseFirstScan = resolve }))
  await staleFolder.coordinator.queuePresenceContexts(staleFolder.port)
  const next = fileUri('C:\\workspace\\src\\next.ts')
  staleFolder.setActiveEditor(next)
  staleFolder.setFolderScan(async () => ({ hasBookmarkedScript: true, hasUnbookmarkedScript: true }))
  await staleFolder.coordinator.queuePresenceContexts(staleFolder.port)
  releaseFirstScan({ hasBookmarkedScript: false, hasUnbookmarkedScript: false })
  await flushAsyncWork()
  await flushAsyncWork()
  assert.ok(staleFolder.events.includes(`context:${Commands.varCurrentFolderHasUnbookmarkedScript}:true`))
  assert.ok(staleFolder.events.includes(`context:${Commands.varCurrentFolderHasBookmarkedScript}:true`))

  const folderFailure = createHarness({
    activeEditor: active,
    folderScan: async () => { throw new Error('scan failed') },
  })
  await folderFailure.coordinator.queuePresenceContexts(folderFailure.port)
  await flushAsyncWork()
  assert.ok(folderFailure.events.includes('failure:ai-folder-state:scan failed'))
  assert.ok(folderFailure.events.includes(`context:${Commands.varCurrentFolderHasUnbookmarkedScript}:true`))
  assert.ok(folderFailure.events.includes(`context:${Commands.varCurrentFolderHasBookmarkedScript}:true`))

  const retryContext = createHarness({
    setContext: async () => { throw new Error('set failed') },
  })
  await assert.rejects(
    retryContext.coordinator.setContextValue('test.key', true, retryContext.port),
    /set failed/,
  )
  retryContext.setSetContext(async () => {})
  await retryContext.coordinator.setContextValue('test.key', true, retryContext.port)
  assert.equal(retryContext.events.filter(event => event === 'context:test.key:true').length, 2)

  const disposed = createHarness()
  await disposed.coordinator.queuePresenceContexts(disposed.port)
  disposed.coordinator.dispose()
  assert.equal(disposed.scheduling.timers.length, 0)
}

main().then(
  () => console.log('BookmarkContextCoordinator contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
