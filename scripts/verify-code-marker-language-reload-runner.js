/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-code-marker-language-reload-runner`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-code-marker-language-reload-runner` 对应契约。
 * 核心边界：通过断言锁定“verify-code-marker-language-reload-runner”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { reloadCodeMarkerLanguageProfiles } = require('../out/providers/CodeMarkerLanguageReloadRunner')

function createHarness(overrides = {}) {
  let current = true
  const events = []
  const port = {
    reloadLanguageProfiles: async () => {
      events.push('reload')
      if (overrides.invalidateAfterReload) current = false
    },
    isCurrent: () => {
      events.push('current')
      return current
    },
    setupFileWatchers: () => events.push('watchers'),
    resetWorkspaceScanScope: () => events.push('reset'),
    synchronizeOpenDocuments: async () => {
      events.push('sync')
      if (overrides.invalidateAfterSync) current = false
    },
    scheduleWorkspaceScan: () => events.push('scan'),
  }
  return { events, port }
}

async function main() {
  let harness = createHarness()
  await reloadCodeMarkerLanguageProfiles(harness.port)
  assert.deepEqual(harness.events, ['reload', 'current', 'watchers', 'reset', 'sync', 'scan'])

  harness = createHarness({ invalidateAfterReload: true })
  await reloadCodeMarkerLanguageProfiles(harness.port)
  assert.deepEqual(harness.events, ['reload', 'current'])

  harness = createHarness({ invalidateAfterSync: true })
  await reloadCodeMarkerLanguageProfiles(harness.port)
  assert.deepEqual(harness.events, ['reload', 'current', 'watchers', 'reset', 'sync', 'scan'])

  harness = createHarness()
  harness.port.reloadLanguageProfiles = async () => {
    harness.events.push('reload')
    throw new Error('expected reload failure')
  }
  await assert.rejects(reloadCodeMarkerLanguageProfiles(harness.port), /expected reload failure/)
  assert.deepEqual(harness.events, ['reload'])

  console.log('CodeMarkerLanguageReloadRunner contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
