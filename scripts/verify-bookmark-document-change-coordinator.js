/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-document-change-coordinator`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-document-change-coordinator` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-document-change-coordinator”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`document`、`createHarness`、`flushAsyncWork`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { BookmarkDocumentChangeCoordinator } = require('../out/providers/BookmarkDocumentChangeCoordinator')

class FakeScheduling {
  constructor(events) {
    this.events = events
    this.timers = []
    this.clearedTimers = []
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
    this.clearedTimers.push(timer)
    this.events.push(`timer:clear:${timer.delay}`)
  }

  runNext() {
    const timer = this.timers.shift()
    assert.ok(timer, 'Expected a document change timer')
    timer.callback()
  }
}

function document(filePath, options = {}) {
  return {
    uri: { scheme: options.scheme ?? 'file', fsPath: filePath },
    languageId: options.languageId ?? 'typescript',
    lines: options.lines ?? ['const value = true'],
  }
}

function createHarness(options = {}) {
  const events = []
  const scheduling = new FakeScheduling(events)
  const coordinator = new BookmarkDocumentChangeCoordinator(scheduling, 300)
  let generation = 1
  let bookmarkState = { id: 'state-1' }
  let currentScope = true
  let bookmarkCount = options.bookmarkCount ?? 1
  let relocate = options.relocate ?? (async () => 0)
  let markerChanged = options.markerChanged ?? false
  const port = {
    isFileDocument: current => current.uri.scheme === 'file',
    documentUri: current => current.uri,
    isCurrentScope: () => currentScope,
    filePath: uri => uri.fsPath,
    relativeBookmarkPath: absolutePath => absolutePath.replace('C:/workspace/', ''),
    currentViewGeneration: () => generation,
    currentBookmarkState: () => bookmarkState,
    bookmarkCount: () => bookmarkCount,
    relocateBookmarks: async (state, bookmarkPath, uri) => {
      events.push(`relocate:${state.id}:${bookmarkPath}:${uri.fsPath}`)
      return relocate(state, bookmarkPath, uri)
    },
    documentLines: current => current.lines,
    documentLanguage: current => current.languageId,
    synchronizeCodeMarkers: (uri, lines, languageId) => {
      events.push(`markers:${uri.fsPath}:${lines.length}:${languageId}`)
      return { changed: markerChanged }
    },
    persistCodeMarkerChanges: paths => events.push(`markers:persist:${paths.join(',')}`),
    saveBookmarks: paths => events.push(`save:${paths.join(',')}`),
    refreshDecorations: () => events.push('refresh'),
    reportFailure: error => events.push(`failure:${error.message}`),
  }
  return {
    coordinator,
    events,
    port,
    scheduling,
    setBookmarkCount: value => { bookmarkCount = value },
    setBookmarkState: value => { bookmarkState = value },
    setCurrentScope: value => { currentScope = value },
    setGeneration: value => { generation = value },
    setMarkerChanged: value => { markerChanged = value },
    setRelocate: value => { relocate = value },
  }
}

async function flushAsyncWork() {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

async function main() {
  const ignored = createHarness()
  ignored.coordinator.handleChange(document('C:/workspace/a.ts'), false, ignored.port)
  ignored.coordinator.handleChange(document('untitled', { scheme: 'untitled' }), true, ignored.port)
  ignored.setCurrentScope(false)
  ignored.coordinator.handleChange(document('C:/workspace/a.ts'), true, ignored.port)
  assert.equal(ignored.scheduling.timers.length, 0)

  const relocated = createHarness({ relocate: async () => 2 })
  const activeDocument = document('C:/workspace/src/a.ts', { lines: ['one', 'two'] })
  relocated.coordinator.handleChange(activeDocument, true, relocated.port)
  relocated.coordinator.handleChange(activeDocument, true, relocated.port)
  assert.equal(relocated.scheduling.timers.length, 1)
  assert.ok(relocated.events.includes('timer:clear:300'))
  relocated.scheduling.runNext()
  await flushAsyncWork()
  assert.deepEqual(relocated.events.slice(-4), [
    'relocate:state-1:src/a.ts:C:/workspace/src/a.ts',
    'markers:C:/workspace/src/a.ts:2:typescript',
    'save:C:/workspace/src/a.ts',
    'refresh',
  ])

  const markers = createHarness({ bookmarkCount: 0, markerChanged: true })
  markers.coordinator.handleChange(activeDocument, true, markers.port)
  markers.scheduling.runNext()
  await flushAsyncWork()
  assert.equal(markers.events.some(event => event.startsWith('relocate:')), false)
  assert.ok(markers.events.includes('markers:persist:C:/workspace/src/a.ts'))
  assert.equal(markers.events.some(event => event.startsWith('save:')), false)

  const combined = createHarness({ relocate: async () => 1, markerChanged: true })
  combined.coordinator.handleChange(activeDocument, true, combined.port)
  combined.scheduling.runNext()
  await flushAsyncWork()
  assert.ok(combined.events.includes('markers:persist:C:/workspace/src/a.ts'))
  assert.equal(combined.events.some(event => event.startsWith('save:')), false)
  assert.equal(combined.events.includes('refresh'), false)

  const stale = createHarness()
  let releaseRelocation
  stale.setRelocate(() => new Promise(resolve => { releaseRelocation = resolve }))
  stale.coordinator.handleChange(activeDocument, true, stale.port)
  stale.scheduling.runNext()
  await flushAsyncWork()
  stale.setGeneration(2)
  releaseRelocation(1)
  await flushAsyncWork()
  assert.equal(stale.events.some(event => event.startsWith('markers:')), false)

  const replacedState = createHarness()
  let releaseStateRelocation
  replacedState.setRelocate(() => new Promise(resolve => { releaseStateRelocation = resolve }))
  replacedState.coordinator.handleChange(activeDocument, true, replacedState.port)
  replacedState.scheduling.runNext()
  await flushAsyncWork()
  replacedState.setBookmarkState({ id: 'state-2' })
  releaseStateRelocation(1)
  await flushAsyncWork()
  assert.equal(replacedState.events.some(event => event.startsWith('markers:')), false)

  const failed = createHarness({ relocate: async () => { throw new Error('relocation failed') } })
  failed.coordinator.handleChange(activeDocument, true, failed.port)
  failed.scheduling.runNext()
  await flushAsyncWork()
  assert.ok(failed.events.includes('failure:relocation failed'))

  const cancellation = createHarness()
  cancellation.coordinator.handleChange(document('C:/workspace/src/feature/a.ts'), true, cancellation.port)
  cancellation.coordinator.handleChange(document('C:/workspace/src/other.ts'), true, cancellation.port)
  cancellation.coordinator.cancelBookmarkPath('src/feature')
  assert.equal(cancellation.scheduling.timers.length, 1)
  cancellation.coordinator.dispose()
  assert.equal(cancellation.scheduling.timers.length, 0)

  const queuedRace = createHarness({ bookmarkCount: 0 })
  queuedRace.coordinator.handleChange(activeDocument, true, queuedRace.port)
  queuedRace.coordinator.handleChange(activeDocument, true, queuedRace.port)
  assert.equal(queuedRace.scheduling.clearedTimers.length, 1)
  queuedRace.scheduling.clearedTimers[0].callback()
  queuedRace.coordinator.cancelBookmarkPath('src/a.ts')
  assert.equal(queuedRace.scheduling.timers.length, 0)
  await flushAsyncWork()

  const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
  assert.match(provider, /bookmarkDocumentChangeCoordinator\.handleChange\(/)
  assert.match(provider, /bookmarkDocumentChangeCoordinator\.cancelBookmarkPath\(bookmarkPath\)/)
  assert.match(provider, /bookmarkDocumentChangeCoordinator\.dispose\(\)/)
  assert.doesNotMatch(provider, /smartTrackTimers/)
}

main().then(
  () => console.log('BookmarkDocumentChangeCoordinator contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
