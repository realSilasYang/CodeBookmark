/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-serial-task-queue`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-serial-task-queue` 对应契约。
 * 核心边界：通过断言锁定“verify-serial-task-queue”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
