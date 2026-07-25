/**
 * 在真实 VS Code 的十三种界面语言和未知非中文回退场景中验证激活、本地化、持久化与主要书签工作流。
 * 每一步都通过扩展公开测试 API 读取结果；清单回退、SVG 元数据等反例也在真实语言模式下执行。
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

async function findNamedFile(root, fileName) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      const nested = await findNamedFile(fullPath, fileName)
      if (nested) return nested
    } else if (entry.isFile() && entry.name === fileName) return fullPath
  }
  return undefined
}

function localizedValue(value) {
  if (typeof value === 'string') return value
  return value?.value
}

async function run() {
  const expectedLocale = process.env.CODEBOOKMARK_TEST_LOCALE
  const expectedRuntimeLanguage = process.env.CODEBOOKMARK_TEST_RUNTIME_LANGUAGE
  const supportedLocales = [
    'zh-cn', 'zh-hk', 'zh-tw', 'en',
    'ja', 'vi', 'ko', 'es', 'fr', 'pt', 'ru', 'de', 'it',
  ]
  const fallbackLocale = 'tr'
  assert.ok([...supportedLocales, fallbackLocale].includes(expectedLocale), 'Integration-test locale must be explicit')
  assert.ok(supportedLocales.includes(expectedRuntimeLanguage), 'Integration-test runtime language must be explicit')
  assert.equal(
    vscode.env.language.toLocaleLowerCase(),
    expectedLocale,
    `Unexpected VS Code language; VSCODE_NLS_CONFIG=${process.env.VSCODE_NLS_CONFIG ?? '<unset>'}`,
  )
  const extension = vscode.extensions.all.find(candidate => candidate.packageJSON?.name === 'codebookmark')
  assert.ok(extension, 'CodeBookmark extension is not installed in the test host')
  const manifestCatalogLocale = supportedLocales.includes(expectedLocale) ? expectedLocale : 'en'
  const manifestCatalog = JSON.parse(await fs.readFile(path.join(
    extension.extensionPath,
    'scripts',
    'i18n',
    'catalogs',
    `manifest.${manifestCatalogLocale}.json`,
  ), 'utf8'))
  const expectedManifestText = {
    view: manifestCatalog['codebookmark.common.commandCategory'],
    toggle: manifestCatalog['codebookmark.contributes.commands.codebookmark.toggleBookmark.title'],
    storage: manifestCatalog['codebookmark.contributes.configuration.main.properties.codebookmark.globalStoragePath.description'],
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
  assert.equal(extensionApi.language, expectedRuntimeLanguage)
  assert.ok(extensionApi.integration, 'Integration test API is unavailable')

  const commands = new Set(await vscode.commands.getCommands(true))
  const contributedCommands = extension.packageJSON.contributes.commands.map(command => command.command)
  assert.equal(new Set(contributedCommands).size, contributedCommands.length, 'Contributed command IDs must be unique')
  for (const command of contributedCommands) {
    assert.equal(commands.has(command), true, `Missing registered command: ${command}`)
  }

  const configuration = vscode.workspace.getConfiguration('codebookmark')
  const contributedConfigurationKeys = extension.packageJSON.contributes.configuration
    .flatMap(group => Object.keys(group.properties))
  for (const configurationKey of contributedConfigurationKeys) {
    assert.match(configurationKey, /^codebookmark\./u)
    assert.equal(
      configuration.has(configurationKey.slice('codebookmark.'.length)),
      true,
      `Missing contributed configuration: ${configurationKey}`,
    )
  }
  assert.equal(configuration.has('language'), false)
  if (!['zh-cn', 'en'].includes(expectedLocale) || expectedRuntimeLanguage !== expectedLocale) {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    return
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(workspaceFolder)
  const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspaceFolder.uri, 'sample.ts'))
  await vscode.window.showTextDocument(document)
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), document.uri.toString())
  // 连续启动多个真实 Extension Host 时，VS Code 的首次工作区初始化可能超过
  // 扩展自身的慢加载提示阈值；测试等待更久，但仍以有限上限识别真正的挂起。
  await extensionApi.integration.waitUntilReady(30_000)

  await extensionApi.integration.addBookmark(1, 'Integration return value')
  let snapshot = extensionApi.integration.snapshot()
  assert.equal(snapshot.roots.length, 1)
  assert.equal(snapshot.roots[0].path, 'sample.ts')
  assert.equal(snapshot.roots[0].children.length, 1)
  assert.equal(snapshot.roots[0].children[0].label, 'Integration return value')
  const scriptId = snapshot.roots[0].scriptId
  const bookmarkId = snapshot.roots[0].children[0].id
  assert.ok(scriptId)
  const bookmarkCount = currentSnapshot => currentSnapshot.roots
    .reduce((count, root) => count + root.children.length, 0)

  await extensionApi.integration.undo()
  assert.equal(bookmarkCount(extensionApi.integration.snapshot()), 0)
  await extensionApi.integration.redo()
  snapshot = extensionApi.integration.snapshot()
  assert.equal(snapshot.roots[0].scriptId, scriptId)
  assert.equal(snapshot.roots[0].children[0].id, bookmarkId)

  await extensionApi.integration.toggleBookmark(0, 'Toggle command bookmark')
  snapshot = extensionApi.integration.snapshot()
  assert.deepEqual(snapshot.roots[0].children.map(child => child.label).sort(), [
    'Integration return value',
    'Toggle command bookmark',
  ].sort())
  await extensionApi.integration.toggleBookmark(0, 'This label must not be requested while deleting')
  assert.deepEqual(
    extensionApi.integration.snapshot().roots[0].children.map(child => child.id),
    [bookmarkId],
  )
  await extensionApi.integration.undo()
  assert.equal(extensionApi.integration.snapshot().roots[0].children.length, 2)
  await extensionApi.integration.redo()
  assert.deepEqual(
    extensionApi.integration.snapshot().roots[0].children.map(child => child.id),
    [bookmarkId],
  )

  await extensionApi.integration.deleteBookmarksAtLine(1)
  snapshot = extensionApi.integration.snapshot()
  assert.equal(bookmarkCount(snapshot), 0)
  await extensionApi.integration.undo()
  snapshot = extensionApi.integration.snapshot()
  assert.equal(snapshot.roots[0].scriptId, scriptId)
  assert.equal(snapshot.roots[0].children[0].id, bookmarkId)
  await extensionApi.integration.redo()
  snapshot = extensionApi.integration.snapshot()
  assert.equal(bookmarkCount(snapshot), 0)
  await extensionApi.integration.undo()
  snapshot = extensionApi.integration.snapshot()
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

  const otherUri = vscode.Uri.joinPath(workspaceFolder.uri, 'other.ts')
  await fs.writeFile(otherUri.fsPath, 'export const other = true\nexport default other\n', 'utf8')
  const otherDocument = await vscode.workspace.openTextDocument(otherUri)
  await vscode.window.showTextDocument(otherDocument)
  await extensionApi.integration.addBookmark(1, 'Other file bookmark')
  snapshot = extensionApi.integration.snapshot()
  const firstFile = snapshot.roots.find(root => root.path === 'externally-moved.ts')
  const otherFile = snapshot.roots.find(root => root.path === 'other.ts')
  assert.ok(firstFile)
  assert.ok(otherFile)
  const otherScriptId = otherFile.scriptId
  const otherBookmarkId = otherFile.children[0].id
  assert.equal(firstFile.children[0].ownerScriptId, scriptId)
  assert.equal(otherFile.children[0].ownerScriptId, otherScriptId)

  await extensionApi.integration.moveNode(otherBookmarkId, firstFile.id)
  snapshot = extensionApi.integration.snapshot()
  const movedIntoFirst = snapshot.roots.find(root => root.path === 'externally-moved.ts')
    .children.find(child => child.id === otherBookmarkId)
  assert.ok(movedIntoFirst)
  assert.equal(movedIntoFirst.ownerScriptId, otherScriptId)
  assert.equal(movedIntoFirst.parentId, firstFile.id)
  assert.equal(movedIntoFirst.treeDepth, 1)
  assert.equal(snapshot.roots.find(root => root.path === 'other.ts').children.length, 0)

  const otherConfiguration = JSON.parse(await fs.readFile(path.join(scriptsFolder, `${otherScriptId}.json`), 'utf8'))
  assert.deepEqual(otherConfiguration.bookmarks.map(item => item.id), [otherBookmarkId])
  const layoutPath = await findNamedFile(path.join(storageRoot, 'scopes'), '_workspace_layout.json')
  assert.ok(layoutPath)
  const persistedLayout = JSON.parse(await fs.readFile(layoutPath, 'utf8'))
  const movedLayoutEntry = persistedLayout.entries.find(entry => entry.node.kind === 'bookmark'
    && entry.node.scriptId === otherScriptId && entry.node.bookmarkId === otherBookmarkId)
  assert.deepEqual(movedLayoutEntry.parent, { kind: 'script', scriptId })

  await extensionApi.integration.reload()
  snapshot = extensionApi.integration.snapshot()
  const reloadedMoved = snapshot.roots.find(root => root.path === 'externally-moved.ts')
    .children.find(child => child.id === otherBookmarkId)
  assert.equal(reloadedMoved.ownerScriptId, otherScriptId)
  assert.equal(reloadedMoved.parentId, firstFile.id)

  await extensionApi.integration.undo()
  snapshot = extensionApi.integration.snapshot()
  assert.equal(snapshot.roots.find(root => root.path === 'externally-moved.ts').children.some(child => child.id === otherBookmarkId), false)
  assert.equal(snapshot.roots.find(root => root.path === 'other.ts').children[0].id, otherBookmarkId)
  await extensionApi.integration.redo()
  snapshot = extensionApi.integration.snapshot()
  assert.equal(snapshot.roots.find(root => root.path === 'externally-moved.ts').children.some(child => child.id === otherBookmarkId), true)

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
