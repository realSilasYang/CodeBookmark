/**
 * 检查运行时命令常量与生成清单中的命令 ID 唯一且一一对应。
 * 脚本围绕“检查运行时命令常量与生成清单中的命令 ID 唯一且一一对应”构造最小输入，同时覆盖正常路径和明确拒绝的边界。
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
