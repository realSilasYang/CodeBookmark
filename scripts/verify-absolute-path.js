/**
 * 锁定绝对路径的规范化、大小写比较、后代判断和重命名映射，特别覆盖相似前缀不能互相包含。
 * 脚本直接调用编译后的 `AbsolutePath`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  absolutePathKey,
  isSameOrDescendantAbsolutePath,
  normalizedAbsolutePath,
  renamedAbsolutePath,
} = require('../out/util/AbsolutePath')

const root = path.resolve('contract-workspace')
const child = path.join(root, 'src', 'example.ts')
const sibling = path.resolve('contract-workspace-other', 'example.ts')

assert.equal(normalizedAbsolutePath(path.join(root, '.', 'src', '..')), root)
assert.equal(absolutePathKey(path.join(root, 'src', '..')), root)
assert.equal(isSameOrDescendantAbsolutePath(root, root), true)
assert.equal(isSameOrDescendantAbsolutePath(child, root), true)
assert.equal(isSameOrDescendantAbsolutePath(sibling, root), false)
assert.equal(isSameOrDescendantAbsolutePath(root, child), false)

const nextRoot = path.resolve('renamed-workspace')
assert.equal(renamedAbsolutePath(child, root, nextRoot), path.join(nextRoot, 'src', 'example.ts'))
