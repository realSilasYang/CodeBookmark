/**
 * 验证语言扩展变化后规则重载、工作区重扫和失败提示的顺序。
 * 脚本直接调用编译后的 `CodeMarkerLanguageReloadRunner`，只在 VS Code 或文件系统边界使用最小替身。
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
