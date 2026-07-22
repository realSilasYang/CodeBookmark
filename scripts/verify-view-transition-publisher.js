const assert = require('node:assert/strict')
const { publishViewTransition } = require('../out/providers/ViewTransitionPublisher')

function createPort({ current = true, treeVisible = false, waitPromise } = {}) {
  const events = []
  const port = {
    get treeVisible() { return treeVisible },
    isCurrent: () => current,
    waitForTreePopulation: () => {
      events.push('wait')
      return waitPromise ?? Promise.resolve()
    },
    fireTreeChanged: () => events.push('tree'),
    queueBookmarkPresenceContexts: async () => { events.push('contexts') },
    setUndoScope: () => events.push('undo'),
  }
  return { port, events, setCurrent: value => { current = value } }
}

async function main() {
  let harness = createPort()
  await publishViewTransition({ previousHasContent: false, nextHasContent: true }, 1, harness.port, 0)
  assert.deepEqual(harness.events, ['tree', 'contexts', 'undo'])

  harness = createPort()
  await publishViewTransition({ previousHasContent: true, nextHasContent: true }, 1, harness.port, 0)
  assert.deepEqual(harness.events, ['contexts', 'tree', 'undo'])

  harness = createPort()
  await publishViewTransition({ previousHasContent: false, nextHasContent: false }, 1, harness.port, 0)
  assert.deepEqual(harness.events, ['contexts', 'undo'])

  harness = createPort({ current: false })
  await publishViewTransition({ previousHasContent: false, nextHasContent: true }, 1, harness.port, 0)
  assert.deepEqual(harness.events, [])

  let release
  const waiting = new Promise(resolve => { release = resolve })
  harness = createPort({ treeVisible: true, waitPromise: waiting })
  const publishing = publishViewTransition({ previousHasContent: false, nextHasContent: true }, 1, harness.port, 0)
  await Promise.resolve()
  assert.deepEqual(harness.events, ['wait', 'tree'])
  harness.setCurrent(false)
  release()
  await publishing
  assert.deepEqual(harness.events, ['wait', 'tree'])

  console.log('ViewTransitionPublisher contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
