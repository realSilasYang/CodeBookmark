const assert = require('node:assert/strict')
const vscode = require('vscode')

async function run() {
  const extension = vscode.extensions.all.find(candidate => candidate.packageJSON?.name === 'codebookmark')
  assert.ok(extension, 'CodeBookmark extension is not installed in the test host')
  await extension.activate()
  assert.equal(extension.isActive, true)

  const commands = new Set(await vscode.commands.getCommands(true))
  for (const command of [
    'codebookmark.toggleBookmark',
    'codebookmark.manageBookmarkConfigurations',
    'codebookmark.ai.openSettings',
    'codebookmark.ai.testConnection',
  ]) {
    assert.equal(commands.has(command), true, `Missing registered command: ${command}`)
  }

  const configuration = vscode.workspace.getConfiguration('codebookmark')
  assert.equal(configuration.has('AI.endpoint'), true)
  assert.equal(configuration.has('AI.apiKey'), true)
  assert.equal(configuration.has('AI.model'), true)

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(workspaceFolder)
  const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspaceFolder.uri, 'sample.ts'))
  await vscode.window.showTextDocument(document)
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), document.uri.toString())
  await vscode.commands.executeCommand('workbench.action.closeAllEditors')
}

module.exports = { run }
