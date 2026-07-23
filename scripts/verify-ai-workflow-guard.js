/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-workflow-guard`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-workflow-guard` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-workflow-guard”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')

const { AIWorkflowGuard } = require('../out/providers/AIWorkflowGuard')

let scope = 'workspace:one'
const bookmarks = new Map([
  ['src/main.ts', [
    { toJSON: () => ({ id: 'one', label: '入口' }) },
  ]],
])
const guard = new AIWorkflowGuard({
  currentStorageScope: () => scope,
  bookmarksForPath: pathRel => bookmarks.get(pathRel) ?? [],
})

const snapshot = guard.captureBookmarkInput('src/main.ts')
assert.equal(snapshot, '[{"id":"one","label":"入口"}]')
assert.doesNotThrow(() => guard.assertBookmarkInput('src/main.ts', snapshot))
assert.doesNotThrow(() => guard.assertStorageScope('workspace:one'))

bookmarks.set('src/main.ts', [{ toJSON: () => ({ id: 'two' }) }])
assert.throws(
  () => guard.assertBookmarkInput('src/main.ts', snapshot),
  /书签已被修改/,
)

scope = 'workspace:two'
assert.throws(
  () => guard.assertStorageScope('workspace:one'),
  /书签作用域已切换/,
)

console.log('AIWorkflowGuard contract verified.')
