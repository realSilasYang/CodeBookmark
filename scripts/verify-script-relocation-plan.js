/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-script-relocation-plan`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-script-relocation-plan` 对应契约。
 * 核心边界：通过断言锁定“verify-script-relocation-plan”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const {
  inferDirectoryRelocation,
  planScriptRelocation,
} = require('../out/repository/ScriptRelocationPlan')

const entry = (id, sourcePath) => ({
  id,
  filePath: path.resolve('storage', `${id}.json`),
  metadata: { id, path: sourcePath, lastSeenAt: 1 },
})
const oldRoot = path.resolve('relocation-old')
const newRoot = path.resolve('relocation-new')
const first = entry('first', path.join(oldRoot, 'a.ts'))
const second = entry('second', path.join(oldRoot, 'nested', 'b.ts'))
const unrelated = entry('unrelated', path.resolve('relocation-other', 'c.ts'))

assert.equal(inferDirectoryRelocation([entry('exact', oldRoot)], oldRoot), false)
assert.equal(inferDirectoryRelocation([first, unrelated], oldRoot), true)

const directoryPlan = planScriptRelocation([first, unrelated, second], oldRoot, newRoot, true)
assert.deepEqual(directoryPlan.map(item => item.entry.id), ['first', 'second'])
assert.deepEqual(directoryPlan.map(item => item.targetPath), [
  path.join(newRoot, 'a.ts'),
  path.join(newRoot, 'nested', 'b.ts'),
])

const oldFile = path.join(oldRoot, 'single.ts')
const newFile = path.join(newRoot, 'renamed.ts')
const duplicateA = entry('duplicate-a', oldFile)
const duplicateB = entry('duplicate-b', oldFile)
const filePlan = planScriptRelocation([duplicateA, second, duplicateB], oldFile, newFile, false)
assert.deepEqual(filePlan.map(item => item.entry.id), ['duplicate-a', 'duplicate-b'])
assert.deepEqual(filePlan.map(item => item.targetPath), [newFile, newFile])

console.log('ScriptRelocationPlan contract verified.')
