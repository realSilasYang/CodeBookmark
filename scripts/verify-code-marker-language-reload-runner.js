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
