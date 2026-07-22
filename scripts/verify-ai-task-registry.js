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
