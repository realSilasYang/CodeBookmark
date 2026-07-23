/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-view-load-finalizer`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-view-load-finalizer` 对应契约。
 * 核心边界：通过断言锁定“verify-view-load-finalizer”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`state`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { finalizeViewLoad } = require('../out/providers/ViewLoadFinalizer')

function createHarness(overrides = {}) {
  let current = overrides.current ?? true
  const events = []
  const port = {
    isCurrent: generation => {
      events.push(`current:${generation}`)
      return current
    },
    setLoadFailedContext: async failed => {
      events.push(`loadFailed:${failed}`)
      if (overrides.contextError) throw new Error('expected context failure')
    },
    setLoadedContext: async () => events.push('loaded'),
    reportContextFailure: error => events.push(`contextFailure:${error.message}`),
    refreshDecorations: () => events.push('refresh'),
    saveAllBookmarks: () => events.push('save'),
    persistWorkspaceOrder: (_prepared, generation) => events.push(`persist:${generation}`),
    startConfigWatcher: generation => events.push(`watcher:${generation}`),
    startBackgroundEnhancements: generation => events.push(`background:${generation}`),
    closeConfigWatchers: () => events.push('closeWatchers'),
    finishLoading: generation => events.push(`finishLoading:${generation}`),
    measure: (startedAt, failed) => events.push(`measure:${startedAt}:${failed}`),
    finishInitialLoad: error => events.push(`finishInitialLoad:${error?.message ?? 'success'}`),
  }
  return { events, port, setCurrent: value => { current = value } }
}

function state(overrides = {}) {
  return {
    generation: 7,
    preserveLoadedContext: false,
    initializationStartedAt: 12,
    storageReady: true,
    prepared: { contentUpdated: false },
    transition: {},
    loadFailure: undefined,
    ...overrides,
  }
}

async function main() {
  let harness = createHarness()
  await finalizeViewLoad(state(), harness.port)
  assert.deepEqual(harness.events, [
    'current:7',
    'loadFailed:false',
    'loaded',
    'refresh',
    'persist:7',
    'watcher:7',
    'background:7',
    'finishLoading:7',
    'measure:12:false',
    'finishInitialLoad:success',
  ])

  harness = createHarness()
  await finalizeViewLoad(state({ storageReady: false }), harness.port)
  assert.deepEqual(harness.events.slice(4, 7), ['persist:7', 'closeWatchers', 'finishLoading:7'])
  assert.equal(harness.events.includes('watcher:7'), false)
  assert.equal(harness.events.includes('background:7'), false)

  harness = createHarness()
  await finalizeViewLoad(state({ prepared: { contentUpdated: true } }), harness.port)
  assert.ok(harness.events.indexOf('save') > harness.events.indexOf('refresh'))
  assert.ok(harness.events.indexOf('persist:7') > harness.events.indexOf('save'))

  harness = createHarness()
  await finalizeViewLoad(state({ prepared: undefined }), harness.port)
  assert.equal(harness.events.some(event => event.startsWith('persist:')), false)

  harness = createHarness({ contextError: true })
  await finalizeViewLoad(state(), harness.port)
  assert.deepEqual(harness.events.slice(0, 4), [
    'current:7',
    'loadFailed:false',
    'contextFailure:expected context failure',
    'refresh',
  ])
  assert.equal(harness.events.includes('loaded'), false)
  assert.equal(harness.events.includes('finishInitialLoad:success'), true)

  const loadFailure = new Error('expected load failure')
  harness = createHarness()
  await assert.rejects(
    finalizeViewLoad(state({ prepared: undefined, transition: undefined, loadFailure }), harness.port),
    error => error === loadFailure,
  )
  assert.deepEqual(harness.events, [
    'current:7',
    'loadFailed:true',
    'loaded',
    'refresh',
    'finishLoading:7',
    'measure:12:true',
    'finishInitialLoad:expected load failure',
  ])

  harness = createHarness()
  await assert.rejects(
    finalizeViewLoad(state({
      preserveLoadedContext: true,
      prepared: undefined,
      transition: undefined,
      loadFailure,
    }), harness.port),
    error => error === loadFailure,
  )
  assert.equal(harness.events[1], 'loadFailed:false')

  harness = createHarness({ current: false })
  await finalizeViewLoad(state({ prepared: { contentUpdated: true } }), harness.port)
  assert.deepEqual(harness.events, ['current:7'])

  console.log('ViewLoadFinalizer contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
