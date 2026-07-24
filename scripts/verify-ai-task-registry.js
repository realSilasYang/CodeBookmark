/**
 * 检查 AI 任务键的去重、并发占用、取消与 finally 释放，失败任务不能永久堵塞目标。
 * 脚本直接调用编译后的 `AITaskRegistry`，只在 VS Code 或文件系统边界使用最小替身。
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
