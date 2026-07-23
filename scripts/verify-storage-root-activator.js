/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-storage-root-activator`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-storage-root-activator` 对应契约。
 * 核心边界：通过断言锁定“verify-storage-root-activator”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
    reportPostTransferFailure: error => events.push(`reportPostFailure:${String(error)}`),
    showPostTransferFailure: error => events.push(`showPostFailure:${String(error)}`),
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

  const postTransferRememberError = new Error('expected post-transfer remember failure')
  harness = createHarness({
    activeRoot: 'source',
    existingRoots: ['source'],
    rememberError: postTransferRememberError,
  })
  assert.equal(await ensureStorageRootActive(harness.port), true)
  assert.deepEqual(harness.events.slice(4), [
    'same:source:target',
    'exists:source',
    'transfer:source:target',
    'activate:target',
    'remember:target',
    `reportPostFailure:${String(postTransferRememberError)}`,
    `showPostFailure:${String(postTransferRememberError)}`,
  ])

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
