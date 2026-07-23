/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-view-transition-publisher`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-view-transition-publisher` 对应契约。
 * 核心边界：通过断言锁定“verify-view-transition-publisher”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createPort`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
