/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-config-watcher-lifecycle`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-config-watcher-lifecycle` 对应契约。
 * 核心边界：通过断言锁定“verify-config-watcher-lifecycle”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { ConfigWatcherLifecycle } = require('../out/providers/ConfigWatcherLifecycle')

function createHarness(overrides = {}) {
  const events = []
  const handles = []
  let current = overrides.current ?? true
  const port = {
    isCurrent: () => current,
    isDirectory: async directory => {
      events.push(`stat:${directory}`)
      return !overrides.missing?.includes(directory)
    },
    rememberDirectory: async directory => {
      events.push(`remember:${directory}`)
      if (overrides.rememberError) throw overrides.rememberError
    },
    watchDirectory: (directory, onFileChange, onError) => {
      events.push(`watch:${directory}`)
      const handle = {
        close: () => events.push(`close:${directory}`),
        onFileChange,
        onError,
      }
      handles.push(handle)
      return handle
    },
    reportSetupFailure: error => events.push(`failure:${error.message}`),
  }
  return { events, handles, port, setCurrent: value => { current = value } }
}

async function main() {
  let lifecycle = new ConfigWatcherLifecycle()
  let harness = createHarness({ missing: ['missing'] })
  await lifecycle.replace(
    ['missing', null, 'scripts', 'workspace'],
    harness.port,
    (directory, filename) => harness.events.push(`file:${directory}:${filename ?? 'none'}`),
    (directory, error) => harness.events.push(`watchError:${directory}:${error.message}`),
  )
  assert.deepEqual(harness.events, [
    'stat:missing',
    'stat:scripts',
    'remember:scripts',
    'watch:scripts',
    'stat:workspace',
    'remember:workspace',
    'watch:workspace',
  ])
  harness.handles[0].onFileChange('bookmark.json')
  harness.handles[1].onError(new Error('expected watcher failure'))
  assert.deepEqual(harness.events.slice(-2), ['file:scripts:bookmark.json', 'watchError:workspace:expected watcher failure'])

  lifecycle = new ConfigWatcherLifecycle()
  harness = createHarness()
  await lifecycle.replace(['old'], harness.port, () => {}, () => {})
  await lifecycle.replace(['new'], harness.port, () => {}, () => {})
  assert.equal(harness.events.includes('close:old'), true)
  lifecycle.close()
  assert.equal(harness.events.includes('close:new'), true)

  lifecycle = new ConfigWatcherLifecycle()
  harness = createHarness()
  harness.setCurrent(false)
  await lifecycle.replace(['stale'], harness.port, () => {}, () => {})
  assert.deepEqual(harness.events, ['stat:stale', 'remember:stale', 'watch:stale', 'close:stale'])

  const rememberError = new Error('expected remember failure')
  lifecycle = new ConfigWatcherLifecycle()
  harness = createHarness({ rememberError })
  await lifecycle.replace(['first', 'second'], harness.port, () => {}, () => {})
  assert.deepEqual(harness.events, ['stat:first', 'remember:first', 'failure:expected remember failure'])

  console.log('ConfigWatcherLifecycle contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
