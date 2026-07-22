const assert = require('node:assert/strict')
const { ensureStorageRootActive } = require('../out/providers/StorageRootActivator')

function createHarness(overrides = {}) {
  const events = []
  const existingRoots = new Set(overrides.existingRoots ?? [])
  const port = {
    rememberedRoot: () => {
      events.push('remembered')
      return overrides.rememberedRoot
    },
    ensureConfigured: () => {
      events.push('ensureConfigured')
      return overrides.configured ?? true
    },
    configuredRoot: () => {
      events.push('configuredRoot')
      return overrides.configuredRoot ?? 'target'
    },
    activeRoot: () => {
      events.push('activeRoot')
      return overrides.activeRoot
    },
    rootExists: root => {
      events.push(`exists:${root}`)
      return existingRoots.has(root)
    },
    sameRoot: (left, right) => {
      events.push(`same:${left}:${right}`)
      return left === right
    },
    transferRoot: async (source, target) => {
      events.push(`transfer:${source}:${target}`)
      if (overrides.transferError !== undefined) throw overrides.transferError
    },
    activateRoot: root => events.push(`activate:${root}`),
    rememberRoot: async root => {
      events.push(`remember:${root}`)
      if (overrides.rememberError !== undefined) throw overrides.rememberError
    },
    warnRememberedFallback: () => events.push('warnFallback'),
    reportTransferFailure: error => events.push(`reportFailure:${String(error)}`),
    showTransferFailure: error => events.push(`showFailure:${String(error)}`),
  }
  return { events, port }
}

async function main() {
  let harness = createHarness({ configured: false })
  assert.equal(await ensureStorageRootActive(harness.port), false)
  assert.deepEqual(harness.events, ['remembered', 'ensureConfigured'])

  harness = createHarness({ configured: false, rememberedRoot: 'remembered' })
  assert.equal(await ensureStorageRootActive(harness.port), false)
  assert.deepEqual(harness.events, ['remembered', 'ensureConfigured', 'exists:remembered'])

  harness = createHarness({
    configured: false,
    rememberedRoot: 'remembered',
    existingRoots: ['remembered'],
  })
  assert.equal(await ensureStorageRootActive(harness.port), true)
  assert.deepEqual(harness.events, [
    'remembered',
    'ensureConfigured',
    'exists:remembered',
    'activate:remembered',
    'warnFallback',
  ])

  harness = createHarness()
  assert.equal(await ensureStorageRootActive(harness.port), true)
  assert.deepEqual(harness.events, [
    'remembered',
    'ensureConfigured',
    'configuredRoot',
    'activeRoot',
    'activate:target',
    'remember:target',
  ])

  harness = createHarness({ activeRoot: 'target' })
  assert.equal(await ensureStorageRootActive(harness.port), true)
  assert.deepEqual(harness.events, [
    'remembered',
    'ensureConfigured',
    'configuredRoot',
    'activeRoot',
    'same:target:target',
    'activate:target',
    'remember:target',
  ])

  harness = createHarness({
    rememberedRoot: 'remembered',
    activeRoot: 'active',
    existingRoots: ['active'],
  })
  assert.equal(await ensureStorageRootActive(harness.port), true)
  assert.deepEqual(harness.events.slice(4), [
    'same:active:target',
    'exists:active',
    'transfer:active:target',
    'activate:target',
    'remember:target',
  ])

  harness = createHarness({ activeRoot: 'missing' })
  assert.equal(await ensureStorageRootActive(harness.port), true)
  assert.deepEqual(harness.events.slice(4), [
    'same:missing:target',
    'exists:missing',
    'activate:target',
    'remember:target',
  ])

  const transferError = new Error('expected transfer failure')
  harness = createHarness({
    activeRoot: 'source',
    existingRoots: ['source'],
    transferError,
  })
  assert.equal(await ensureStorageRootActive(harness.port), true)
  assert.deepEqual(harness.events.slice(4), [
    'same:source:target',
    'exists:source',
    'transfer:source:target',
    'activate:source',
    `reportFailure:${String(transferError)}`,
    `showFailure:${String(transferError)}`,
  ])
  assert.equal(harness.events.includes('remember:target'), false)

  const rememberError = new Error('expected remember failure')
  harness = createHarness({ rememberError })
  await assert.rejects(ensureStorageRootActive(harness.port), error => error === rememberError)
  assert.deepEqual(harness.events.slice(-2), ['activate:target', 'remember:target'])

  console.log('StorageRootActivator contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
