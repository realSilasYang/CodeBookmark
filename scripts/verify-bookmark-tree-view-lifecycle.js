/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-tree-view-lifecycle`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-tree-view-lifecycle` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-tree-view-lifecycle”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { BookmarkTreeViewLifecycle } = require('../out/providers/BookmarkTreeViewLifecycle')

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
    this.events.push(`timer:clear:${timer.delay}`)
  }

  runDelay(delay) {
    const index = this.timers.findIndex(timer => timer.delay === delay)
    assert.ok(index >= 0, `Expected a ${delay}ms timer`)
    const [timer] = this.timers.splice(index, 1)
    timer.callback()
  }
}

function createHarness() {
  const events = []
  const scheduling = new FakeScheduling(events)
  const lifecycle = new BookmarkTreeViewLifecycle(scheduling, 8000, 1500, 10, 50)
  const treeView = { id: 'tree' }
  const fileNode = { id: 'file' }
  const bookmark = { id: 'bookmark' }
  const state = {
    disposed: false,
    treeView,
    workspace: true,
    viewGeneration: 1,
    treeVisible: true,
    activePath: 'C:/workspace/main.ts',
    hasFileNode: true,
    fileNode,
    bookmarkState: { id: 'state' },
    currentBookmark: bookmark,
  }
  const port = {
    isDisposed: () => state.disposed,
    currentTreeView: () => state.treeView,
    setLoadingMessage: view => events.push(`message:loading:${view.id}`),
    reportSlowInitialLoad: delay => events.push(`slow:${delay}`),
    setSlowLoadingMessage: view => events.push(`message:slow:${view.id}`),
    clearInitialLoadMessage: view => events.push(`message:clear:${view.id}`),
    reportInitialLoadFailure: error => events.push(`failure:${error.message}`),
    setInitialLoadFailureMessage: view => events.push(`message:failure:${view.id}`),
    isWorkspaceScope: () => state.workspace,
    currentViewLoadGeneration: () => state.viewGeneration,
    treeVisible: () => state.treeVisible,
    bookmarkPathForEditor: editor => editor.path.replace('C:/workspace/', ''),
    hasFileNode: () => state.hasFileNode,
    fileNode: () => state.fileNode,
    activeEditorMatches: editor => state.activePath === editor.path,
    treeViewAvailable: () => state.treeView !== undefined,
    currentBookmarkState: () => state.bookmarkState,
    findBookmark: candidate => state.currentBookmark?.id === candidate.id ? state.currentBookmark : undefined,
    revealNode: node => events.push(`reveal:${node.id}`),
  }
  return { bookmark, events, lifecycle, port, scheduling, state, treeView }
}

async function main() {
  const slow = createHarness()
  slow.lifecycle.startInitialLoad(slow.treeView, slow.port)
  assert.deepEqual(slow.events, ['message:loading:tree', 'timer:8000'])
  slow.scheduling.runDelay(8000)
  assert.deepEqual(slow.events.slice(-2), ['slow:8000', 'message:slow:tree'])
  slow.lifecycle.finishInitialLoad(undefined, slow.port)
  assert.deepEqual(slow.events.slice(-2), ['timer:clear:8000', 'message:clear:tree'])
  slow.lifecycle.finishInitialLoad(new Error('ignored'), slow.port)
  assert.equal(slow.events.some(event => event === 'failure:ignored'), false)

  const failed = createHarness()
  failed.lifecycle.startInitialLoad(failed.treeView, failed.port)
  failed.lifecycle.finishInitialLoad(new Error('load failed'), failed.port)
  assert.deepEqual(failed.events.slice(-3), [
    'timer:clear:8000',
    'failure:load failed',
    'message:failure:tree',
  ])

  const population = createHarness()
  let firstResolved = false
  const firstWait = population.lifecycle.waitForPopulation(1).then(() => { firstResolved = true })
  const secondWait = population.lifecycle.waitForPopulation(2)
  await firstWait
  assert.equal(firstResolved, true)
  population.lifecycle.resolvePopulation(1)
  assert.equal(population.scheduling.timers.some(timer => timer.delay === 1500), true)
  population.lifecycle.resolvePopulation(2)
  await secondWait
  assert.equal(population.scheduling.timers.some(timer => timer.delay === 1500), false)
  const timedWait = population.lifecycle.waitForPopulation(3)
  population.scheduling.runDelay(1500)
  await timedWait

  const active = createHarness()
  const editor = { path: 'C:/workspace/main.ts' }
  const revealGeneration = active.lifecycle.nextRevealGeneration()
  active.lifecycle.scheduleActiveFileReveal(editor, 1, revealGeneration, active.port)
  active.scheduling.runDelay(10)
  assert.equal(active.events.at(-1), 'reveal:file')

  const staleActive = createHarness()
  const staleRevealGeneration = staleActive.lifecycle.nextRevealGeneration()
  staleActive.lifecycle.scheduleActiveFileReveal(editor, 1, staleRevealGeneration, staleActive.port)
  staleActive.lifecycle.nextRevealGeneration()
  staleActive.scheduling.runDelay(10)
  assert.equal(staleActive.events.some(event => event.startsWith('reveal:')), false)

  const unavailableActive = createHarness()
  unavailableActive.state.workspace = false
  unavailableActive.lifecycle.scheduleActiveFileReveal(editor, 1, 0, unavailableActive.port)
  unavailableActive.state.workspace = true
  unavailableActive.state.treeVisible = false
  unavailableActive.lifecycle.scheduleActiveFileReveal(editor, 1, 0, unavailableActive.port)
  unavailableActive.state.treeVisible = true
  unavailableActive.state.hasFileNode = false
  unavailableActive.lifecycle.scheduleActiveFileReveal(editor, 1, 0, unavailableActive.port)
  assert.equal(unavailableActive.scheduling.timers.length, 0)

  const changedActive = createHarness()
  const changedRevealGeneration = changedActive.lifecycle.nextRevealGeneration()
  changedActive.lifecycle.scheduleActiveFileReveal(editor, 1, changedRevealGeneration, changedActive.port)
  changedActive.state.activePath = 'C:/workspace/other.ts'
  changedActive.scheduling.runDelay(10)
  assert.equal(changedActive.events.some(event => event.startsWith('reveal:')), false)

  const staleView = createHarness()
  const staleViewRevealGeneration = staleView.lifecycle.nextRevealGeneration()
  staleView.lifecycle.scheduleActiveFileReveal(editor, 1, staleViewRevealGeneration, staleView.port)
  staleView.state.viewGeneration = 2
  staleView.scheduling.runDelay(10)
  assert.equal(staleView.events.some(event => event.startsWith('reveal:')), false)

  const pinned = createHarness()
  pinned.lifecycle.schedulePinnedBookmarkReveal(pinned.bookmark, pinned.port)
  pinned.scheduling.runDelay(50)
  assert.equal(pinned.events.at(-1), 'reveal:bookmark')
  pinned.lifecycle.schedulePinnedBookmarkReveal(pinned.bookmark, pinned.port)
  pinned.state.bookmarkState = { id: 'next-state' }
  pinned.scheduling.runDelay(50)
  assert.equal(pinned.events.filter(event => event === 'reveal:bookmark').length, 1)

  const missingPinned = createHarness()
  missingPinned.lifecycle.schedulePinnedBookmarkReveal(missingPinned.bookmark, missingPinned.port)
  missingPinned.state.currentBookmark = undefined
  missingPinned.scheduling.runDelay(50)
  assert.equal(missingPinned.events.some(event => event.startsWith('reveal:')), false)

  const stalePinnedView = createHarness()
  stalePinnedView.lifecycle.schedulePinnedBookmarkReveal(stalePinnedView.bookmark, stalePinnedView.port)
  stalePinnedView.state.viewGeneration++
  stalePinnedView.scheduling.runDelay(50)
  assert.equal(stalePinnedView.events.some(event => event.startsWith('reveal:')), false)

  const disposed = createHarness()
  disposed.lifecycle.startInitialLoad(disposed.treeView, disposed.port)
  const pending = disposed.lifecycle.waitForPopulation(1)
  disposed.state.disposed = true
  disposed.lifecycle.dispose()
  await pending
  assert.equal(disposed.scheduling.timers.length, 0)

  const disposedReveal = createHarness()
  const disposedRevealGeneration = disposedReveal.lifecycle.nextRevealGeneration()
  disposedReveal.lifecycle.scheduleActiveFileReveal(editor, 1, disposedRevealGeneration, disposedReveal.port)
  disposedReveal.lifecycle.schedulePinnedBookmarkReveal(disposedReveal.bookmark, disposedReveal.port)
  disposedReveal.state.disposed = true
  disposedReveal.lifecycle.dispose()
  disposedReveal.scheduling.runDelay(10)
  disposedReveal.scheduling.runDelay(50)
  assert.equal(disposedReveal.events.some(event => event.startsWith('reveal:')), false)

  const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
  assert.match(provider, /bookmarkTreeViewLifecycle\.startInitialLoad\(treeView, this\.bookmarkTreeViewLifecyclePort\(\)\)/)
  assert.match(provider, /bookmarkTreeViewLifecycle\.waitForPopulation\(generation\)/)
  assert.match(provider, /bookmarkTreeViewLifecycle\.scheduleActiveFileReveal\(/)
  assert.match(provider, /bookmarkTreeViewLifecycle\.schedulePinnedBookmarkReveal\(/)
  assert.match(provider, /bookmarkTreeViewLifecycle\.dispose\(\)/)
  assert.doesNotMatch(provider, /initialLoadWatchdog|initialLoadSettled|treeRevealGeneration|pendingTreePopulation/)
}

main().then(
  () => console.log('BookmarkTreeViewLifecycle contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
