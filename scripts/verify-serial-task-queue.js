const assert = require('node:assert/strict')
const { SerialTaskQueue } = require('../out/util/SerialTaskQueue')

async function main() {
  const queue = new SerialTaskQueue()
  const events = []
  let releaseFirst
  const first = queue.run(async () => {
    events.push('first:start')
    await new Promise(resolve => { releaseFirst = resolve })
    events.push('first:end')
    return 'first-result'
  })
  const second = queue.run(async () => {
    events.push('second')
    return 'second-result'
  })
  await Promise.resolve()
  assert.deepEqual(events, ['first:start'])
  releaseFirst()
  assert.equal(await first, 'first-result')
  assert.equal(await second, 'second-result')
  assert.deepEqual(events, ['first:start', 'first:end', 'second'])

  const failure = new Error('expected queue failure')
  const rejected = queue.run(async () => { throw failure })
  const afterFailure = queue.run(async () => 'after-failure')
  await assert.rejects(rejected, error => error === failure)
  assert.equal(await afterFailure, 'after-failure')
}

main().then(() => console.log('SerialTaskQueue contract verified.'))
