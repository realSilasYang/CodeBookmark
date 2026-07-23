/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-workspace-order-view-loader`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-workspace-order-view-loader` 对应契约。
 * 核心边界：通过断言锁定“verify-workspace-order-view-loader”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { readWorkspaceOrderForView } = require('../out/providers/WorkspaceOrderViewLoader')

function createHarness(overrides = {}) {
  const events = []
  const port = {
    resolveBookmarkFolder: scopeFilePath => {
      events.push(`folder:${scopeFilePath ?? 'none'}`)
      return overrides.folder
    },
    readFile: async filePath => {
      events.push(`read:${filePath}`)
      if (overrides.readError) throw overrides.readError
      return overrides.content ?? '[]'
    },
    reportReadFailure: error => events.push(`failure:${error.message}`),
  }
  return { events, port }
}

async function main() {
  let harness = createHarness({ folder: 'C:/workspace', content: '["src/b.ts", "src/missing.ts", "src/b.ts"]' })
  let result = await readWorkspaceOrderForView(
    ['src/a.ts', 'src/b.ts'],
    'workspace:one',
    'C:/workspace/main.ts',
    undefined,
    harness.port,
  )
  assert.deepEqual(result, {
    order: ['src/b.ts', 'src/a.ts'],
    filePath: path.join('C:/workspace', '_workspace_order.json'),
    needsPersist: true,
  })
  assert.deepEqual(harness.events, [
    'folder:C:/workspace/main.ts',
    `read:${path.join('C:/workspace', '_workspace_order.json')}`,
  ])

  harness = createHarness({ folder: 'C:/workspace', content: '["src/a.ts"]' })
  result = await readWorkspaceOrderForView(['src/a.ts'], 'file:C:/workspace/main.ts', 'C:/workspace/main.ts', undefined, harness.port)
  assert.deepEqual(result, { order: null, needsPersist: false })
  assert.deepEqual(harness.events, [])

  const controller = new AbortController()
  controller.abort()
  harness = createHarness({ folder: 'C:/workspace' })
  result = await readWorkspaceOrderForView(['src/a.ts'], 'workspace:one', 'C:/workspace/main.ts', controller.signal, harness.port)
  assert.deepEqual(result, { order: null, needsPersist: false })
  assert.deepEqual(harness.events, [])

  const readError = Object.assign(new Error('missing order'), { code: 'ENOENT' })
  harness = createHarness({ folder: 'C:/workspace', readError })
  result = await readWorkspaceOrderForView(['src/a.ts', 'src/b.ts'], 'workspace:one', 'C:/workspace/main.ts', undefined, harness.port)
  assert.deepEqual(result, {
    order: ['src/a.ts', 'src/b.ts'],
    filePath: path.join('C:/workspace', '_workspace_order.json'),
    needsPersist: true,
  })
  assert.equal(harness.events.includes('failure:missing order'), false)

  const parseError = new Error('invalid order')
  harness = createHarness({ folder: 'C:/workspace', readError: parseError })
  result = await readWorkspaceOrderForView(['src/a.ts'], 'workspace:one', 'C:/workspace/main.ts', undefined, harness.port)
  assert.equal(result.needsPersist, true)
  assert.equal(harness.events.includes('failure:invalid order'), true)

  const abortAfterRead = new AbortController()
  harness = createHarness({ folder: 'C:/workspace', content: '[]' })
  const originalRead = harness.port.readFile
  harness.port.readFile = async filePath => {
    const content = await originalRead(filePath)
    abortAfterRead.abort()
    return content
  }
  result = await readWorkspaceOrderForView(['src/a.ts'], 'workspace:one', 'C:/workspace/main.ts', abortAfterRead.signal, harness.port)
  assert.deepEqual(result, { order: null, needsPersist: false })

  console.log('WorkspaceOrderViewLoader contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
