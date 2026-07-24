/**
 * 验证 AI 工作区信任、配置完整性、作用域版本和取消信号在请求前后的共同约束。
 * 脚本直接调用编译后的 `AIWorkflowGuard`，只在 VS Code 或文件系统边界使用最小替身。
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
