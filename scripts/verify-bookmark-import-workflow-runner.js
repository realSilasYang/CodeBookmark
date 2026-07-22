const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-import-workflow-'))
const configFile = path.join(sandbox, 'bookmarks.json')
const configFolder = path.join(sandbox, 'bookmark-configs')
const targetFile = path.join(sandbox, 'target.ts')
fs.writeFileSync(configFile, '{}')
fs.mkdirSync(configFolder)
fs.writeFileSync(targetFile, 'const target = true\n')

const informationMessages = []
const openDialogCalls = []
const quickPickCalls = []
let openDialogResult
let quickPickSelector = () => undefined
let editorWorkspaceFolder

const { vscode } = createVscodeFake({
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: () => editorWorkspaceFolder,
  },
  window: {
    activeTextEditor: undefined,
    showInformationMessage: message => { informationMessages.push(message) },
    showOpenDialog: async options => {
      openDialogCalls.push(options)
      return openDialogResult
    },
    showQuickPick: async (items, options) => {
      quickPickCalls.push({ items, options })
      return quickPickSelector(items)
    },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { runImportBookmarkConfiguration } = require('../out/providers/BookmarkImportWorkflowRunner')
restoreModules()

function uri(filePath) {
  return { scheme: 'file', fsPath: filePath }
}

function editor(filePath) {
  return { document: { uri: uri(filePath) } }
}

function importedFileNode() {
  const file = { isFile: true, subs: [] }
  const root = { isFile: false, parent: file, subs: [] }
  const child = { isFile: false, parent: root, subs: [] }
  root.subs.push(child)
  file.subs.push(root)
  return file
}

async function main() {
  const events = []
  let existingBookmarks = []
  let folderResult = {
    total: 1,
    imported: 1,
    skipped: 0,
    failed: 0,
    cancelled: false,
    bookmarkSummary: { total: 2, levelCounts: [1, 1] },
  }
  let currentScope = 'scope:stable'
  let mutateScopeDuringFileImport = false
  let mutateScopeDuringFolderImport = false
  const port = {
    ensureEditorScope: async currentEditor => { events.push(`ensure:${currentEditor.document.uri.fsPath}`) },
    absoluteToRelative: filePath => `relative:${filePath}`,
    bookmarksForPath: bookmarkPath => {
      events.push(`lookup:${bookmarkPath}`)
      return existingBookmarks
    },
    storageScopeForUri: () => currentScope,
    runImportTransaction: async operation => {
      events.push('transaction:start')
      try {
        return await operation()
      } finally {
        events.push('transaction:end')
      }
    },
    captureUndoState: () => {
      events.push('capture')
      return { captured: true }
    },
    commitImportUndo: () => { events.push('commit') },
    importFolder: async (source, workspaceRoot) => {
      events.push(`folder:${source}:${workspaceRoot}`)
      if (mutateScopeDuringFolderImport) currentScope = 'scope:changed'
      return folderResult
    },
    importFile: async (source, target) => {
      events.push(`file:${source}:${target}`)
      if (mutateScopeDuringFileImport) currentScope = 'scope:changed'
      return importedFileNode()
    },
    refresh: async (currentEditor, expectedScope) => {
      events.push(`refresh:${currentEditor?.document.uri.fsPath ?? 'none'}:${expectedScope}`)
    },
  }

  const reset = () => {
    events.length = 0
    informationMessages.length = 0
    openDialogCalls.length = 0
    quickPickCalls.length = 0
    openDialogResult = undefined
    quickPickSelector = () => undefined
    editorWorkspaceFolder = undefined
    vscode.workspace.workspaceFolders = []
    vscode.window.activeTextEditor = undefined
    existingBookmarks = []
    folderResult = {
      total: 1,
      imported: 1,
      skipped: 0,
      failed: 0,
      cancelled: false,
      bookmarkSummary: { total: 2, levelCounts: [1, 1] },
    }
    currentScope = 'scope:stable'
    mutateScopeDuringFileImport = false
    mutateScopeDuringFolderImport = false
  }

  reset()
  await runImportBookmarkConfiguration(port)
  assert.deepEqual(events, [])
  assert.equal(openDialogCalls.length, 0)
  assert.equal(informationMessages.at(-1), '请先打开要绑定书签配置的本地脚本，或打开一个工作区后导入配置文件夹。')

  reset()
  vscode.window.activeTextEditor = editor(targetFile)
  existingBookmarks = [{ id: 'existing' }]
  await runImportBookmarkConfiguration(port)
  assert.deepEqual(events, [`ensure:${targetFile}`, `lookup:relative:${targetFile}`])
  assert.equal(openDialogCalls.length, 0)
  assert.equal(informationMessages.at(-1), '当前脚本已经存在书签，无需导入配置。')

  reset()
  vscode.window.activeTextEditor = editor(targetFile)
  openDialogResult = [uri(configFile)]
  await runImportBookmarkConfiguration(port)
  assert.deepEqual(events, [
    `ensure:${targetFile}`,
    `lookup:relative:${targetFile}`,
    'transaction:start',
    'capture',
    `file:${configFile}:${targetFile}`,
    'commit',
    `refresh:${targetFile}:scope:stable`,
    'transaction:end',
  ])
  assert.deepEqual(openDialogCalls[0], {
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: '导入并绑定',
    title: '为 target.ts 导入书签配置',
    defaultUri: undefined,
    filters: { 'CodeBookmark 配置': ['json'] },
  })
  assert.equal(informationMessages.at(-1), '已导入并绑定书签配置：target.ts；导入结果：共 2 个书签：一级 1 个、二级 1 个。')

  reset()
  const workspaceFolder = { name: 'workspace', uri: uri(path.join(sandbox, 'workspace')) }
  vscode.workspace.workspaceFolders = [workspaceFolder]
  openDialogResult = [uri(configFolder)]
  folderResult = {
    total: 4,
    imported: 2,
    skipped: 1,
    failed: 1,
    cancelled: false,
    bookmarkSummary: { total: 5, levelCounts: [3, 2] },
  }
  await runImportBookmarkConfiguration(port)
  assert.deepEqual(events, [
    'transaction:start',
    'capture',
    `folder:${configFolder}:${workspaceFolder.uri.fsPath}`,
    'commit',
    'refresh:none:scope:stable',
    'transaction:end',
  ])
  assert.equal(openDialogCalls[0].canSelectFolders, true)
  assert.equal(openDialogCalls[0].defaultUri, workspaceFolder.uri)
  assert.equal(openDialogCalls[0].title, '选择书签配置文件或配置文件夹')
  assert.equal(
    informationMessages.at(-1),
    '已从配置文件夹导入 2 个脚本的书签配置（跳过 1 个，失败 1 个）；导入结果：共 5 个书签：一级 3 个、二级 2 个。',
  )

  reset()
  vscode.window.activeTextEditor = editor(targetFile)
  editorWorkspaceFolder = workspaceFolder
  openDialogResult = [uri(configFolder)]
  await runImportBookmarkConfiguration(port)
  assert.equal(openDialogCalls[0].canSelectFolders, true)
  assert.equal(openDialogCalls[0].defaultUri, workspaceFolder.uri)
  assert.deepEqual(events, [
    `ensure:${targetFile}`,
    `lookup:relative:${targetFile}`,
    'transaction:start',
    'capture',
    `folder:${configFolder}:${workspaceFolder.uri.fsPath}`,
    'commit',
    `refresh:${targetFile}:scope:stable`,
    'transaction:end',
  ])

  reset()
  const firstWorkspace = { name: 'first', uri: uri(path.join(sandbox, 'first')) }
  const secondWorkspace = { name: 'second', uri: uri(path.join(sandbox, 'second')) }
  vscode.workspace.workspaceFolders = [firstWorkspace, secondWorkspace]
  quickPickSelector = items => items[1]
  await runImportBookmarkConfiguration(port)
  assert.equal(quickPickCalls[0].items[1].workspaceFolder, secondWorkspace)
  assert.deepEqual(quickPickCalls[0].options, {
    title: '选择要导入书签配置的工作区根目录',
    placeHolder: '多根工作区需要先选择目标根目录',
  })
  assert.equal(openDialogCalls[0].defaultUri, secondWorkspace.uri)

  reset()
  vscode.workspace.workspaceFolders = [workspaceFolder]
  openDialogResult = [uri(configFolder)]
  folderResult = { total: 5, imported: 0, skipped: 2, failed: 1, cancelled: true, bookmarkSummary: { total: 0, levelCounts: [] } }
  await runImportBookmarkConfiguration(port)
  assert.deepEqual(events, [
    'transaction:start',
    'capture',
    `folder:${configFolder}:${workspaceFolder.uri.fsPath}`,
    'transaction:end',
  ])
  assert.equal(informationMessages.at(-1), '已取消导入书签配置文件夹。')

  reset()
  vscode.workspace.workspaceFolders = [workspaceFolder]
  openDialogResult = [uri(configFolder)]
  folderResult = { total: 0, imported: 0, skipped: 0, failed: 0, cancelled: false, bookmarkSummary: { total: 0, levelCounts: [] } }
  await assert.rejects(runImportBookmarkConfiguration(port), /所选文件夹中没有找到可导入的书签配置文件/)
  assert.equal(events.includes('commit'), false)
  assert.equal(events.includes('refresh:none:scope:stable'), false)

  reset()
  vscode.workspace.workspaceFolders = [workspaceFolder]
  openDialogResult = [uri(configFolder)]
  folderResult = { total: 3, imported: 0, skipped: 2, failed: 1, cancelled: false, bookmarkSummary: { total: 0, levelCounts: [] } }
  await assert.rejects(runImportBookmarkConfiguration(port), /跳过 2 个，失败 1 个/)

  reset()
  vscode.workspace.workspaceFolders = [workspaceFolder]
  openDialogResult = [uri(configFile)]
  await runImportBookmarkConfiguration(port)
  assert.deepEqual(events, [])
  assert.equal(informationMessages.at(-1), '导入单个配置文件前，请先打开要绑定的本地脚本；工作区模式可直接选择配置文件夹。')

  reset()
  vscode.window.activeTextEditor = editor(targetFile)
  openDialogResult = [uri(configFolder)]
  await runImportBookmarkConfiguration(port)
  assert.equal(events.includes('transaction:start'), false)
  assert.equal(informationMessages.at(-1), '只有工作区模式支持导入整个书签配置文件夹。')

  reset()
  vscode.window.activeTextEditor = editor(targetFile)
  openDialogResult = [uri(path.join(sandbox, 'missing.json'))]
  await assert.rejects(runImportBookmarkConfiguration(port), /无法读取所选配置路径：/)

  reset()
  vscode.window.activeTextEditor = editor(targetFile)
  openDialogResult = [uri(configFile)]
  mutateScopeDuringFileImport = true
  await assert.rejects(
    runImportBookmarkConfiguration(port),
    /导入完成前活动脚本作用域发生变化，请重新打开目标脚本确认结果/,
  )
  assert.equal(events.includes('commit'), true)
  assert.equal(events.some(event => event.startsWith('refresh:')), false)
  assert.equal(events.at(-1), 'transaction:end')

  reset()
  vscode.workspace.workspaceFolders = [workspaceFolder]
  openDialogResult = [uri(configFolder)]
  mutateScopeDuringFolderImport = true
  await assert.rejects(
    runImportBookmarkConfiguration(port),
    /导入完成前工作区作用域发生变化，请重新加载工作区确认结果/,
  )
  assert.equal(events.includes('commit'), true)
  assert.equal(events.some(event => event.startsWith('refresh:')), false)
  assert.equal(events.at(-1), 'transaction:end')
}

main().then(
  () => console.log('BookmarkImportWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
