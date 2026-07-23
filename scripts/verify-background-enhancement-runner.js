/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-background-enhancement-runner`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-background-enhancement-runner` 对应契约。
 * 核心边界：通过断言锁定“verify-background-enhancement-runner”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createPort`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { runBackgroundEnhancements } = require('../out/providers/BackgroundEnhancementRunner')

function createPort(overrides = {}) {
  let current = true
  const events = []
  return {
    events,
    setCurrent: value => { current = value },
    port: {
      isCurrent: () => current,
      setupCodeMarkerFileWatchers: () => events.push('watchers'),
      synchronizeOpenCodeMarkerDocuments: async () => {
        events.push('sync')
        if (overrides.invalidateAfterSync) current = false
        if (overrides.syncError) throw new Error('expected sync failure')
      },
      scheduleWorkspaceCodeMarkerScan: () => events.push('scan'),
      reportFailure: error => events.push(`failure:${error.message}`),
      measure: (startedAt, scope) => events.push(`measure:${startedAt}:${scope ?? 'none'}`),
    },
  }
}

async function main() {
  let harness = createPort()
  await runBackgroundEnhancements(Promise.resolve(), 'workspace:a', 4, 12, harness.port)
  assert.deepEqual(harness.events, ['watchers', 'sync', 'scan', 'measure:12:workspace:a'])

  harness = createPort()
  harness.setCurrent(false)
  await runBackgroundEnhancements(Promise.resolve(), 'workspace:a', 4, 12, harness.port)
  assert.deepEqual(harness.events, ['measure:12:workspace:a'])

  harness = createPort({ invalidateAfterSync: true })
  await runBackgroundEnhancements(Promise.resolve(), 'workspace:a', 4, 12, harness.port)
  assert.deepEqual(harness.events, ['watchers', 'sync', 'measure:12:workspace:a'])

  harness = createPort({ syncError: true })
  await runBackgroundEnhancements(Promise.resolve(), 'workspace:a', 4, 12, harness.port)
  assert.deepEqual(harness.events, [
    'watchers',
    'sync',
    'failure:expected sync failure',
    'measure:12:workspace:a',
  ])

  harness = createPort()
  await runBackgroundEnhancements(Promise.reject(new Error('expected profile failure')), undefined, 4, 12, harness.port)
  assert.deepEqual(harness.events, ['failure:expected profile failure', 'measure:12:none'])

  console.log('BackgroundEnhancementRunner contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
