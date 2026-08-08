/**
 * 验证书签视图在启动期收到同作用域编辑器事件时，会替换尚未完成的首次加载并最终进入就绪状态。
 * 测试使用可控计时器锁定竞态顺序，不依赖真实 VS Code 宿主或磁盘环境。
 */
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const { BookmarkViewMutationBarrier } = require('../../out/providers/BookmarkViewMutationBarrier')
const { BookmarkViewRefreshCoordinator } = require('../../out/providers/BookmarkViewRefreshCoordinator')

describe('bookmark view refresh', () => {
  it('replaces an unfinished initial load when the active editor stays in the same scope', async () => {
    const scheduled = []
    const coordinator = new BookmarkViewRefreshCoordinator({
      setTimer: callback => {
        const timer = { callback }
        scheduled.push(timer)
        return timer
      },
      clearTimer: timer => { timer.cleared = true },
    })
    const storageScope = 'workspace:c:/workspace'
    const editorPath = 'C:\\workspace\\sample.ts'
    let generation = 1
    let loadingGeneration = 1
    let initialized
    const refresh = coordinator.refresh({
      document: { uri: { scheme: 'file', fsPath: editorPath } },
    }, storageScope, false, {
      currentStorageScope: () => storageScope,
      viewLoaded: () => false,
      currentScopeFilePath: () => undefined,
      setCurrentScopeFilePath: () => {},
      workspaceRoot: () => 'C:\\workspace',
      nextRevealGeneration: () => 1,
      beginViewLoad: () => ++generation,
      currentViewLoadGeneration: () => generation,
      loadingViewGeneration: () => loadingGeneration,
      clearLoading: () => { loadingGeneration = undefined },
      markLoading: candidateGeneration => { loadingGeneration = candidateGeneration },
      resetCodeMarkerScan: () => {},
      queueBookmarkPresenceContexts: async () => {},
      restoreConfigWatcher: () => {},
      restoreBackgroundEnhancements: () => {},
      scheduleActiveFileReveal: () => {},
      initView: async (scopePath, candidateGeneration, candidateScope) => {
        initialized = { scopePath, candidateGeneration, candidateScope }
      },
      isCurrent: (candidateGeneration, candidateScope) =>
        candidateGeneration === generation && candidateScope === storageScope,
      treeVisible: () => false,
      reportRefreshFailure: error => { throw error },
    })

    assert.equal(scheduled.length, 1)
    assert.equal(generation, 2)
    scheduled[0].callback()
    await refresh
    assert.deepEqual(initialized, {
      scopePath: editorPath,
      candidateGeneration: 2,
      candidateScope: storageScope,
    })
  })

  it('cancels a scheduled disk load before an in-memory bookmark mutation', async () => {
    let timer
    let generation = 4
    let loadingGeneration
    let initialized = false
    const coordinator = new BookmarkViewRefreshCoordinator({
      setTimer: callback => {
        timer = { callback, cleared: false }
        return timer
      },
      clearTimer: candidate => { candidate.cleared = true },
    })
    const port = {
      currentStorageScope: () => 'workspace:c:/workspace',
      viewLoaded: () => true,
      currentScopeFilePath: () => 'C:\\workspace\\sample.ts',
      setCurrentScopeFilePath: () => {},
      workspaceRoot: () => 'C:\\workspace',
      nextRevealGeneration: () => 1,
      beginViewLoad: () => ++generation,
      currentViewLoadGeneration: () => generation,
      loadingViewGeneration: () => loadingGeneration,
      clearLoading: () => { loadingGeneration = undefined },
      markLoading: candidateGeneration => { loadingGeneration = candidateGeneration },
      resetCodeMarkerScan: () => {},
      queueBookmarkPresenceContexts: async () => {},
      restoreConfigWatcher: () => {},
      restoreBackgroundEnhancements: () => {},
      scheduleActiveFileReveal: () => {},
      initView: async () => { initialized = true },
      isCurrent: candidateGeneration => candidateGeneration === generation,
      treeVisible: () => false,
      reportRefreshFailure: error => { throw error },
    }

    const refresh = coordinator.refresh(undefined, 'workspace:c:/workspace', true, port)
    assert.equal(loadingGeneration, 5)
    assert.equal(coordinator.cancelPendingLoad(port), 6)
    await refresh

    assert.equal(timer.cleared, true)
    assert.equal(loadingGeneration, undefined)
    assert.equal(initialized, false)
  })

  it('restarts disk-reload settling when a bookmark mutates while persistence is draining', async () => {
    const barrier = new BookmarkViewMutationBarrier()
    const events = []
    let metadataPass = 0
    let releaseFirstMetadata
    const firstMetadata = new Promise(resolve => { releaseFirstMetadata = resolve })

    const reload = barrier.runAfterSettled({
      waitForMetadataWrites: async () => {
        events.push(`metadata:${++metadataPass}`)
        if (metadataPass === 1) await firstMetadata
      },
      flushPendingBookmarks: async () => { events.push(`bookmarks:${metadataPass}`) },
    }, async () => {
      events.push('reload')
      return 'reloaded'
    })

    await Promise.resolve()
    barrier.markMutation()
    releaseFirstMetadata()

    assert.equal(await reload, 'reloaded')
    assert.deepEqual(events, [
      'metadata:1',
      'bookmarks:1',
      'metadata:2',
      'bookmarks:2',
      'reload',
    ])
  })
})
