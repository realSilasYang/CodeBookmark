/**
 * 模块说明：本文件负责真实 Extension Host 集成测试，具体对象为 `index`。
 *
 * 实现要点：在真实宿主内执行用户路径，并对持久化结果、语言环境与移动恢复进行端到端断言。
 * 核心边界：测试使用可重复的输入与隔离环境验证公开行为，不依赖人工界面判断。
 * 主要入口：`markerDirectiveFixture`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vscode = require('vscode')

async function waitFor(assertion, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      return assertion()
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  throw new Error(`${message}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

function localizedValue(value) {
  if (typeof value === 'string') return value
  return value?.value
}

async function run() {
  const expectedLocale = process.env.CODEBOOKMARK_TEST_LOCALE
  assert.ok(expectedLocale === 'zh-cn' || expectedLocale === 'en', 'Integration-test locale must be explicit')
  assert.equal(
    vscode.env.language.toLocaleLowerCase(),
    expectedLocale,
    `Unexpected VS Code language; VSCODE_NLS_CONFIG=${process.env.VSCODE_NLS_CONFIG ?? '<unset>'}`,
  )
  const extension = vscode.extensions.all.find(candidate => candidate.packageJSON?.name === 'codebookmark')
  assert.ok(extension, 'CodeBookmark extension is not installed in the test host')
  const expectedManifestText = expectedLocale === 'zh-cn'
    ? {
        view: '代码书签',
        toggle: '添加/删除书签',
        storage: '书签配置目录的绝对路径（必填，支持 ~ 和 %ENV%）',
      }
    : {
        view: 'Code Bookmarks',
        toggle: 'Add/Remove Bookmark',
        storage: 'Absolute path to the bookmark configuration directory (required; supports ~ and %ENV%).',
      }
  assert.equal(localizedValue(extension.packageJSON.contributes.views.codebookmark[0].name), expectedManifestText.view)
  assert.equal(
    localizedValue(extension.packageJSON.contributes.commands.find(command => command.command === 'codebookmark.toggleBookmark')?.title),
    expectedManifestText.toggle,
  )
  const storageSetting = extension.packageJSON.contributes.configuration
    .flatMap(group => Object.entries(group.properties))
    .find(([key]) => key === 'codebookmark.globalStoragePath')?.[1]
  assert.equal(localizedValue(storageSetting?.description), expectedManifestText.storage)
  const storageRoot = process.env.CODEBOOKMARK_TEST_STORAGE_ROOT
  assert.ok(storageRoot, 'Integration-test storage root must be explicit')
  const configurationBeforeActivation = vscode.workspace.getConfiguration('codebookmark')
  await configurationBeforeActivation.update('globalStoragePath', storageRoot, vscode.ConfigurationTarget.Global)
  const extensionApi = await extension.activate()
  assert.equal(extension.isActive, true)
  assert.equal(extensionApi.language, expectedLocale)
  assert.ok(extensionApi.integration, 'Integration test API is unavailable')

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
  assert.equal(configuration.has('AI.address'), true)
  assert.equal(configuration.has('AI.APIKey'), true)
  assert.equal(configuration.has('AI.model'), true)

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(workspaceFolder)
  const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspaceFolder.uri, 'sample.ts'))
  await vscode.window.showTextDocument(document)
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), document.uri.toString())
  await extensionApi.integration.waitUntilReady()

  await extensionApi.integration.addBookmark(1, 'Integration return value')
  let snapshot = extensionApi.integration.snapshot()
  assert.equal(snapshot.roots.length, 1)
  assert.equal(snapshot.roots[0].path, 'sample.ts')
  assert.equal(snapshot.roots[0].children.length, 1)
  assert.equal(snapshot.roots[0].children[0].label, 'Integration return value')
  const scriptId = snapshot.roots[0].scriptId
  const bookmarkId = snapshot.roots[0].children[0].id
  assert.ok(scriptId)

  await extensionApi.integration.undo()
  assert.equal(extensionApi.integration.snapshot().roots.length, 0)
  await extensionApi.integration.redo()
  snapshot = extensionApi.integration.snapshot()
  assert.equal(snapshot.roots[0].scriptId, scriptId)
  assert.equal(snapshot.roots[0].children[0].id, bookmarkId)

  const scriptsFolder = path.join(storageRoot, 'scripts')
  const configurationFiles = await fs.readdir(scriptsFolder)
  assert.deepEqual(configurationFiles, [`${scriptId}.json`])
  const persistedBeforeMove = JSON.parse(await fs.readFile(path.join(scriptsFolder, configurationFiles[0]), 'utf8'))
  assert.equal(persistedBeforeMove.format, 'codebookmark.script')
  assert.equal(persistedBeforeMove.schemaVersion, 1)
  assert.equal(path.resolve(persistedBeforeMove.script.path), path.resolve(document.uri.fsPath))
  assert.equal(persistedBeforeMove.bookmarks[0].id, bookmarkId)

  const movedUri = vscode.Uri.joinPath(workspaceFolder.uri, 'moved.ts')
  await vscode.workspace.fs.rename(document.uri, movedUri)
  const movedDocument = await vscode.workspace.openTextDocument(movedUri)
  await vscode.window.showTextDocument(movedDocument)
  await waitFor(() => {
    const movedSnapshot = extensionApi.integration.snapshot()
    assert.equal(movedSnapshot.roots[0].path, 'moved.ts')
    assert.equal(movedSnapshot.roots[0].scriptId, scriptId)
    assert.equal(movedSnapshot.roots[0].children[0].id, bookmarkId)
  }, 'VS Code rename did not preserve bookmark identity')

  const externallyMovedPath = path.join(workspaceFolder.uri.fsPath, 'externally-moved.ts')
  await fs.rename(movedUri.fsPath, externallyMovedPath)
  const externallyMovedDocument = await vscode.workspace.openTextDocument(externallyMovedPath)
  await vscode.window.showTextDocument(externallyMovedDocument)
  await waitFor(() => {
    const movedSnapshot = extensionApi.integration.snapshot()
    assert.equal(movedSnapshot.roots[0].path, 'externally-moved.ts')
    assert.equal(movedSnapshot.roots[0].scriptId, scriptId)
    assert.equal(movedSnapshot.roots[0].children[0].id, bookmarkId)
  }, 'External move did not preserve bookmark identity')
  await extensionApi.integration.flush()

  const persistedAfterMove = JSON.parse(await fs.readFile(path.join(scriptsFolder, configurationFiles[0]), 'utf8'))
  assert.equal(persistedAfterMove.format, 'codebookmark.script')
  assert.equal(persistedAfterMove.schemaVersion, 1)
  assert.equal(path.resolve(persistedAfterMove.script.path), path.resolve(externallyMovedPath))
  assert.equal(persistedAfterMove.bookmarks[0].id, bookmarkId)

  const markerUri = vscode.Uri.joinPath(workspaceFolder.uri, 'marker-directives.ts')
  await fs.writeFile(markerUri.fsPath, [
    'export function markerDirectiveFixture(): boolean {',
    '\t// Automatic TODO/FIXME/BUG bookmarks are synchronized from explicit directives.',
    '\t// TODO: first task',
    '\t// FIXME: second task',
    '\t// BUG: third task',
    '\treturn true',
    '}',
  ].join('\n'), 'utf8')
  const markerDocument = await vscode.workspace.openTextDocument(markerUri)
  await vscode.window.showTextDocument(markerDocument)
  assert.equal(markerDocument.languageId, 'typescript')
  await extensionApi.integration.synchronizeCodeMarkers()
  snapshot = extensionApi.integration.snapshot()
  const markerRoot = snapshot.roots.find(root => root.path === 'marker-directives.ts')
  assert.ok(markerRoot, 'Explicit TypeScript marker directives were not synchronized')
  assert.deepEqual(markerRoot.children.map(child => child.label), [
    'TODO: first task',
    'FIXME: second task',
    'BUG: third task',
  ])

  const svgUri = vscode.Uri.joinPath(workspaceFolder.uri, 'status_bug.svg')
  await fs.writeFile(svgUri.fsPath, [
    '<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">',
    '\t<!-- Minimalist Flat Code Bug -->',
    '\t<!-- TODO Icon Metadata -->',
    '\t<!-- FIXME Icon Metadata -->',
    '\t<!-- BUG Icon Metadata -->',
    '\t<circle cx="64" cy="64" r="32" />',
    '</svg>',
  ].join('\n'), 'utf8')
  const svgDocument = await vscode.workspace.openTextDocument(svgUri)
  await vscode.window.showTextDocument(svgDocument)
  assert.notEqual(svgDocument.languageId, 'plaintext')
  await extensionApi.integration.synchronizeCodeMarkers()
  snapshot = extensionApi.integration.snapshot()
  assert.equal(
    snapshot.roots.some(root => root.path === 'status_bug.svg'),
    false,
    'SVG metadata prose was incorrectly treated as a TODO/FIXME/BUG directive',
  )
  await vscode.commands.executeCommand('workbench.action.closeAllEditors')
}

module.exports = { run }
