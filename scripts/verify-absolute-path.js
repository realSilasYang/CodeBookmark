/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-absolute-path`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-absolute-path` 对应契约。
 * 核心边界：通过断言锁定“verify-absolute-path”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
