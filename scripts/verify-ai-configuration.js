const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const openedSettings = []
const errorMessages = []
const registeredCommands = new Map()
const values = new Map()
const { vscode } = createVscodeFake({
  workspace: {
    getConfiguration: section => ({
      get: key => values.get(`${section}.${key}`),
    }),
  },
  commands: {
	registerCommand: (command, handler) => {
	  registeredCommands.set(command, handler)
	  return { dispose() {} }
	},
    executeCommand: async (command, argument) => {
      if (command === 'workbench.action.openSettings') openedSettings.push(argument)
    },
  },
  window: {
    showErrorMessage: message => { errorMessages.push(message) },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { ExtensionConfig } = require('../out/config/ExtensionConfig')
const { bookmarkCommands } = require('../out/commands/bookmarkCommands')
restoreModules()

values.set('codebookmark.AI.endpoint', '')
values.set('codebookmark.AI.apiKey', '')
values.set('codebookmark.AI.model', '')
values.set('codebookmark.AI.assignIcons', false)
ExtensionConfig.invalidate()
assert.equal(ExtensionConfig.ensureAIConfigured(), false)
assert.deepEqual(openedSettings, ['codebookmark.AI'])
assert.match(errorMessages.at(-1), /Endpoint、API Key、模型名称/)
assert.equal(ExtensionConfig.aiAssignIcons, false)

values.set('codebookmark.AI.endpoint', 'http://127.0.0.1:1234/v1/chat/completions')
values.set('codebookmark.AI.apiKey', 'test-key')
values.set('codebookmark.AI.model', 'test-model')
ExtensionConfig.invalidate()
assert.equal(ExtensionConfig.ensureAIConfigured(), true)
assert.deepEqual(openedSettings, ['codebookmark.AI'])
assert.equal(ExtensionConfig.aiAssignIcons, false)

async function verifyAICommandEntries() {
  values.set('codebookmark.AI.endpoint', '')
  values.set('codebookmark.AI.apiKey', '')
  values.set('codebookmark.AI.model', '')
  ExtensionConfig.invalidate()
  openedSettings.length = 0

  const context = { subscriptions: [], extensionUri: {} }
  bookmarkCommands(context, {})
  await registeredCommands.get('codebookmark.ai.generateAppend')()
  await registeredCommands.get('codebookmark.ai.optimizeDirect')()
  await registeredCommands.get('codebookmark.ai.optimizeFolderDirect')()
  await registeredCommands.get('codebookmark.ai.optimizeSelectedDirect')()
	await registeredCommands.get('codebookmark.ai.generateAppendFolderDirect')()
	await registeredCommands.get('codebookmark.ai.generateOverwriteFolderDirect')()
	await registeredCommands.get('codebookmark.ai.generateSkipFolderDirect')()

  await registeredCommands.get('codebookmark.ai.openSettings')()

  assert.deepEqual(openedSettings, [
    'codebookmark.AI',
    'codebookmark.AI',
    'codebookmark.AI',
    'codebookmark.AI',
    'codebookmark.AI',
		'codebookmark.AI',
		'codebookmark.AI',
		'codebookmark.AI',
  ])
  assert.ok(errorMessages.slice(-7).every(message => /请先补全 AI 配置/.test(message)))
}

verifyAICommandEntries().then(
  () => console.log('AI configuration contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
