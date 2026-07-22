const assert = require('node:assert/strict')
const { runViewLoadPipeline } = require('../out/providers/ViewLoadPipeline')

function port(overrides = {}) {
  let current = overrides.current ?? true
  const events = []
  const value = {
    isCurrent: () => current,
    enqueue: async operation => {
      events.push('enqueue')
      if (overrides.skipQueue) return undefined
      return operation()
    },
    ensureStorageRoot: async () => {
      events.push('ensure')
      if (overrides.invalidateOnEnsure) current = false
      return overrides.storageReady ?? true
    },
    prepare: async () => {
      events.push('prepare')
      if (overrides.invalidateOnPrepare) current = false
      return 'prepared'
    },
    empty: () => {
      events.push('empty')
      return 'empty'
    },
    commit: prepared => {
      events.push(`commit:${prepared}`)
      return 'transition'
    },
    publish: async transition => {
      events.push(`publish:${transition}`)
      if (overrides.invalidateOnPublish) current = false
    },
    reportFailure: error => events.push(`failure:${error.message}`),
  }
  return { value, events, setCurrent: next => { current = next } }
}

async function main() {
  let harness = port()
  let result = await runViewLoadPipeline(7, harness.value)
  assert.deepEqual(result, {
    cancelled: false,
    storageReady: true,
    prepared: 'prepared',
    transition: 'transition',
    loadFailure: undefined,
  })
  assert.deepEqual(harness.events, ['enqueue', 'ensure', 'prepare', 'commit:prepared', 'publish:transition'])

  harness = port({ storageReady: false })
  result = await runViewLoadPipeline(7, harness.value)
  assert.equal(result.cancelled, false)
  assert.equal(result.storageReady, false)
  assert.equal(result.prepared, 'empty')
  assert.deepEqual(harness.events, ['enqueue', 'ensure', 'empty', 'commit:empty', 'publish:transition'])

  harness = port({ invalidateOnEnsure: true })
  result = await runViewLoadPipeline(7, harness.value)
  assert.equal(result.cancelled, true)
  assert.deepEqual(harness.events, ['enqueue', 'ensure'])

  harness = port({ skipQueue: true })
  result = await runViewLoadPipeline(7, harness.value)
  assert.deepEqual(result, { cancelled: true, storageReady: false })
  assert.deepEqual(harness.events, ['enqueue'])

  harness = port({ invalidateOnPublish: true })
  result = await runViewLoadPipeline(7, harness.value)
  assert.equal(result.cancelled, true)
  assert.equal(result.transition, 'transition')

  harness = port()
  harness.value.prepare = async () => { throw new Error('expected prepare failure') }
  result = await runViewLoadPipeline(7, harness.value)
  assert.equal(result.cancelled, false)
  assert.equal(result.loadFailure.message, 'expected prepare failure')
  assert.deepEqual(harness.events, ['enqueue', 'ensure', 'failure:expected prepare failure'])

  console.log('ViewLoadPipeline contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
