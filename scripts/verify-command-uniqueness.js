/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-command-uniqueness`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-command-uniqueness` 对应契约。
 * 核心边界：通过断言锁定“verify-command-uniqueness”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const packageJson = require('../package.json')

const commandIds = packageJson.contributes.commands.map(command => command.command)
assert.equal(new Set(commandIds).size, commandIds.length)
assert.equal(commandIds.filter(command => command.startsWith('codebookmark.undo')).length > 1, true)
assert.equal(commandIds.filter(command => command.startsWith('codebookmark.redo')).length > 1, true)

const titleCommands = packageJson.contributes.menus['view/title'].map(item => item.command).filter(Boolean)
assert.equal(titleCommands.filter(command => command === 'codebookmark.undo').length, 1)
assert.equal(titleCommands.filter(command => command === 'codebookmark.redo').length, 1)
assert.equal(new Set(titleCommands).size, titleCommands.length)
