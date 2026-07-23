/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-task-registry`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-task-registry` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-task-registry”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')

const { AITaskRegistry } = require('../out/providers/AITaskRegistry')

const registry = new AITaskRegistry()
const fileTask = registry.fileTaskKey('workspace:one', 'src/main.ts')
const otherFileTask = registry.fileTaskKey('workspace:one', 'src/other.ts')

assert.equal(fileTask, 'workspace:one\0src/main.ts')
assert.equal(registry.isFileRunning(fileTask), false)
assert.equal(registry.tryStartFile(fileTask), true)
assert.equal(registry.isFileRunning(fileTask), true)
assert.equal(registry.tryStartFile(fileTask), false)
assert.equal(registry.tryStartFile(otherFileTask), true)
registry.finishFile(fileTask)
assert.equal(registry.isFileRunning(fileTask), false)
assert.equal(registry.isFileRunning(otherFileTask), true)
registry.finishFile(otherFileTask)

assert.equal(registry.isFolderRunning('workspace:one'), false)
assert.equal(registry.tryStartFolder('workspace:one'), true)
assert.equal(registry.tryStartFolder('workspace:one'), false)
assert.equal(registry.tryStartFolder('workspace:two'), true)
registry.finishFolder('workspace:one')
assert.equal(registry.isFolderRunning('workspace:one'), false)
assert.equal(registry.isFolderRunning('workspace:two'), true)
registry.finishFolder('workspace:two')

console.log('AITaskRegistry contract verified.')
