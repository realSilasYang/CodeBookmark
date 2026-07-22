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
