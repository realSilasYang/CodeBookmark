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
