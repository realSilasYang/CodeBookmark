/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-configuration`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-configuration` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-configuration”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`verifyAICommandEntries`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const openedSettings = []
const errorMessages = []
const informationMessages = []
const warningMessages = []
const registeredCommands = new Map()
const values = new Map()
const inspections = new Map()
const configurationUpdates = []
const workingAddress = 'http://127.0.0.1:1234/v1/chat/completions'
const { vscode } = createVscodeFake({
	ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    getConfiguration: section => ({
      get: key => values.get(`${section}.${key}`),
	  inspect: key => inspections.get(`${section}.${key}`),
	  update: async (key, value, target) => {
		const fullKey = `${section}.${key}`
		configurationUpdates.push({ fullKey, value, target })
		values.set(fullKey, value)
		const inspection = { ...(inspections.get(fullKey) || {}) }
		if (target === vscode.ConfigurationTarget.WorkspaceFolder) inspection.workspaceFolderValue = value
		else if (target === vscode.ConfigurationTarget.Workspace) inspection.workspaceValue = value
		else inspection.globalValue = value
		inspections.set(fullKey, inspection)
	  },
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
	showInformationMessage: message => { informationMessages.push(message) },
	showWarningMessage: message => { warningMessages.push(message) },
  },
})
const aiService = { testConnection: async () => workingAddress }
const restoreModules = installModuleMocks({
	vscode,
	'../util/AIService': { AIService: aiService },
})
const { ExtensionConfig } = require('../out/config/ExtensionConfig')
const { bookmarkCommands } = require('../out/commands/bookmarkCommands')
restoreModules()

values.set('codebookmark.AI.address', '')
values.set('codebookmark.AI.APIKey', '')
values.set('codebookmark.AI.model', '')
values.set('codebookmark.AI.assignIcons', false)
ExtensionConfig.invalidate()
assert.equal(ExtensionConfig.ensureAIConfigured(), false)
assert.deepEqual(openedSettings, ['codebookmark.AI'])
assert.match(errorMessages.at(-1), /接口地址、模型名称/)
assert.equal(ExtensionConfig.aiAssignIcons, false)

values.set('codebookmark.AI.address', 'http://127.0.0.1:1234/v1/chat/completions')
values.set('codebookmark.AI.APIKey', '')
values.set('codebookmark.AI.model', 'test-model')
ExtensionConfig.invalidate()
assert.equal(ExtensionConfig.ensureAIConfigured(), true)
assert.deepEqual(openedSettings, ['codebookmark.AI'])
assert.equal(ExtensionConfig.aiAssignIcons, false)

async function verifyAICommandEntries() {
  values.set('codebookmark.AI.address', '')
  values.set('codebookmark.AI.APIKey', '')
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

	values.set('codebookmark.AI.address', 'http://127.0.0.1:1234')
	values.set('codebookmark.AI.model', 'test-model')
	inspections.set('codebookmark.AI.address', { workspaceValue: 'http://127.0.0.1:1234' })
	ExtensionConfig.invalidate()
	await registeredCommands.get('codebookmark.ai.testConnection')()
	assert.deepEqual(configurationUpdates.at(-1), {
		fullKey: 'codebookmark.AI.address',
		value: workingAddress,
		target: vscode.ConfigurationTarget.Workspace,
	})
	assert.equal(ExtensionConfig.aiAddress, workingAddress)
	assert.match(informationMessages.at(-1), /接口地址已更新为实际可用地址/)
	assert.equal(warningMessages.length, 0)

	const updateCount = configurationUpdates.length
	assert.equal(await ExtensionConfig.updateAIAddress(workingAddress), false)
	assert.equal(configurationUpdates.length, updateCount, 'an already-canonical address must not be rewritten')

	for (const [inspectionKey, target] of [
		['globalValue', vscode.ConfigurationTarget.Global],
		['workspaceFolderValue', vscode.ConfigurationTarget.WorkspaceFolder],
	]) {
		const inputAddress = `http://127.0.0.1:1234/${inspectionKey}`
		const completedAddress = `${inputAddress}/v1/chat/completions`
		values.set('codebookmark.AI.address', inputAddress)
		inspections.set('codebookmark.AI.address', { [inspectionKey]: inputAddress })
		ExtensionConfig.invalidate()
		assert.equal(await ExtensionConfig.updateAIAddress(completedAddress), true)
		assert.deepEqual(configurationUpdates.at(-1), {
			fullKey: 'codebookmark.AI.address',
			value: completedAddress,
			target,
		})
	}

	const failedInput = 'http://127.0.0.1:1234/failed-test'
	values.set('codebookmark.AI.address', failedInput)
	inspections.set('codebookmark.AI.address', { workspaceValue: failedInput })
	ExtensionConfig.invalidate()
	aiService.testConnection = async () => { throw new Error('connection rejected') }
	const updatesBeforeFailure = configurationUpdates.length
	await registeredCommands.get('codebookmark.ai.testConnection')()
	assert.equal(configurationUpdates.length, updatesBeforeFailure)
	assert.equal(ExtensionConfig.aiAddress, failedInput)
	assert.match(errorMessages.at(-1), /AI 连接测试失败：connection rejected/)
}

verifyAICommandEntries().then(
  () => console.log('AI configuration contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
