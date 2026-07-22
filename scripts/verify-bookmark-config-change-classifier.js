const assert = require('node:assert/strict')
const { classifyBookmarkConfigChanges } = require('../out/providers/BookmarkConfigChangeClassifier')

function createSource(overrides = {}) {
  const events = []
  return {
    events,
    source: {
      collectExternalChanges: async directory => {
        events.push(`collect:${directory}`)
        return overrides.collected ?? []
      },
      hasExternalChange: async (directory, filename) => {
        events.push(`check:${directory}:${filename}`)
        return overrides.changed !== false
      },
    },
  }
}

async function main() {
  let harness = createSource({ collected: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json', 'ignored.txt', '_workspace_order.json'] })
  let failures = []
  let result = await classifyBookmarkConfigChanges(
    [
      ['C:/scripts', new Set([null])],
      ['C:/workspace', new Set(['_workspace_order.json'])],
      ['C:/other', new Set(['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json'])],
    ],
    'C:/scripts',
    'C:/workspace',
    harness.source,
    {
      sameDirectory: (left, right) => left.toLowerCase() === right.toLowerCase(),
      reportFailure: (directory, error) => failures.push(`${directory}:${error.message}`),
    },
  )
  assert.equal(result.orderChanged, true)
  assert.deepEqual([...result.incrementalChanges.entries()].map(([directory, names]) => [directory, [...names]]), [
    ['C:/scripts', ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json']],
  ])
  assert.deepEqual(harness.events, [
    'collect:C:/scripts',
    'check:C:/workspace:_workspace_order.json',
    'check:C:/other:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json',
  ])
  assert.deepEqual(failures, [])

  harness = createSource({ changed: false })
  result = await classifyBookmarkConfigChanges(
    [['C:/scripts', new Set(['cccccccc-cccc-cccc-cccc-cccccccccccc.json', 'not-a-config.json'])]],
    'C:/scripts',
    null,
    harness.source,
    { sameDirectory: (left, right) => left === right, reportFailure: () => assert.fail('unexpected failure') },
  )
  assert.deepEqual(result, { orderChanged: false, incrementalChanges: new Map() })

  const expectedError = new Error('expected fingerprint failure')
  harness = createSource()
  harness.source.collectExternalChanges = async () => { throw expectedError }
  failures = []
  result = await classifyBookmarkConfigChanges(
    [['C:/scripts', new Set([null])], ['C:/other', new Set(['dddddddd-dddd-dddd-dddd-dddddddddddd.json'])]],
    'C:/scripts',
    null,
    harness.source,
    {
      sameDirectory: (left, right) => left === right,
      reportFailure: (directory, error) => failures.push(`${directory}:${error.message}`),
    },
  )
  assert.deepEqual(failures, ['C:/scripts:expected fingerprint failure'])
  assert.deepEqual([...result.incrementalChanges.entries()], [])

  console.log('BookmarkConfigChangeClassifier contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
