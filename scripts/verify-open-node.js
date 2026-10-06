/**
 * 验证书签跳转使用扩展自己的 showTextDocument 打开流程。
 * 普通未打开目标始终打开为固定标签；已打开的目标文件继续复用原编辑器列。
 * 跳转到编辑器后保留树条目选择，不清空选择或重新聚焦书签列表。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const commands = new Map()
const shown = []
const eventOrder = []
const documents = new Map()
const uri = fsPath => ({
  scheme: 'file',
  fsPath: path.resolve(fsPath),
  toString: () => `file://${path.resolve(fsPath)}`,
})
const documentFor = fileUri => {
  const key = path.resolve(fileUri.fsPath)
  if (!documents.has(key)) documents.set(key, {
    uri: fileUri,
    lineCount: 2,
    lineAt: line => ({
      lineNumber: line,
      text: line === 0 ? 'const value = 1' : 'consume(value)',
      range: { end: { line, character: line === 0 ? 15 : 14 } },
    }),
  })
  return documents.get(key)
}

class Position {
  constructor(line, character) { this.line = line; this.character = character }
  isEqual(other) { return this.line === other.line && this.character === other.character }
}
class Range {
  constructor(start, end) { this.start = start; this.end = end }
}
class Selection extends Range {}

const sourceUri = uri('src/source.ts')
const targetUri = uri('src/target.ts')
const workspaceFolderUri = uri(process.cwd())
const activeEditor = { document: documentFor(sourceUri), viewColumn: 1 }
const welcomeTab = { label: 'Welcome', input: undefined }
const closedTabs = []
const tabGroups = {
  all: [],
  close: async tabs => {
    closedTabs.push(...(Array.isArray(tabs) ? tabs : [tabs]))
    return true
  },
}
const treeView = { visible: true, selection: [] }
let openDocumentHook = () => undefined
let navigationInProgress = false
const window = {
  activeTextEditor: activeEditor,
  visibleTextEditors: [activeEditor],
  tabGroups,
  showTextDocument: async (document, options) => {
    assert.equal(navigationInProgress, true, 'Editor focus must change inside scroll-preserving navigation')
    eventOrder.push('show')
    const editor = { document, viewColumn: options.viewColumn, revealRange() {} }
    shown.push({ document, options, editor })
    return editor
  },
  showErrorMessage() {},
}
const { vscode } = createVscodeFake({
  Position,
  Range,
  Selection,
  TextEditorRevealType: { InCenterIfOutsideViewport: 1 },
  ViewColumn: { Active: -1 },
  window,
  workspace: {
    workspaceFolders: [{ uri: workspaceFolderUri }],
    workspaceFile: undefined,
    openTextDocument: async fileUri => {
      await openDocumentHook()
      return documentFor(fileUri)
    },
  },
  commands: {
    registerCommand: (command, handler) => { commands.set(command, handler); return { dispose() {} } },
    executeCommand: async command => {
      eventOrder.push(command)
      throw new Error(`Unexpected command execution: ${command}`)
    },
  },
})
const restoreModules = installModuleMocks({
  vscode,
  '../util/FileUtils': { fileUtils: { relativeToUri: bookmarkPath => bookmarkPath === 'src/target.ts' ? targetUri : uri(bookmarkPath) } },
})

async function main() {
  try {
    const { openNodeCommand } = require('../out/commands/openNodeCommand')
    openNodeCommand({ subscriptions: [] }, async navigation => {
      navigationInProgress = true
      try { await navigation() } finally { navigationInProgress = false }
    })
    const openCommand = [...commands.values()][0]
    assert.equal(typeof openCommand, 'function')
    const open = bookmark => openCommand(bookmark)
    const bookmark = {
      id: 'navigation-bookmark',
      path: 'src/target.ts',
      isFile: false,
      start: { line: 1, column: 0 },
      end: { line: 1, column: 7 },
    }

    vscode.window.activeTextEditor = undefined
    vscode.window.visibleTextEditors = []
    tabGroups.all = [{ viewColumn: 1, tabs: [welcomeTab] }]
    await open(bookmark)
    assert.deepEqual(eventOrder, ['show'])
    assert.deepEqual(closedTabs, [welcomeTab])
    assert.deepEqual(shown.at(-1).options, { viewColumn: -1, preserveFocus: false, preview: false })

    vscode.window.activeTextEditor = activeEditor
    vscode.window.visibleTextEditors = [activeEditor]
    tabGroups.all = [{
      viewColumn: 9,
      tabs: [
        { input: undefined },
        { input: {} },
        { input: { uri: sourceUri } },
      ],
    }]
    await open(bookmark)
    assert.deepEqual(eventOrder, ['show', 'show'])
    assert.equal(closedTabs.length, 1)
    assert.deepEqual(shown.at(-1).options, { viewColumn: 1, preserveFocus: false, preview: false })

    tabGroups.all = [{
      viewColumn: 2,
      tabs: [{ input: { uri: targetUri } }],
    }]
    await open(bookmark)
    assert.deepEqual(shown.at(-1).options, { viewColumn: 2, preserveFocus: false })

    vscode.window.visibleTextEditors = [activeEditor, { document: documentFor(targetUri), viewColumn: 3 }]
    await open(bookmark)
    assert.deepEqual(shown.at(-1).options, { viewColumn: 3, preserveFocus: false })
    assert.equal(shown.at(-1).editor.selection.start.line, 1)

    // 点击条目后跳转到编辑器，仍保留该条目选择；重新聚焦会使宿主滚动到中间。
    eventOrder.length = 0
    treeView.selection = [bookmark]
    await open(bookmark)
    assert.deepEqual(eventOrder, ['show'])
    assert.deepEqual(treeView.selection, [bookmark])
    assert.equal(shown.at(-1).options.preserveFocus, false)

    // 搜索或外部命令同样保留已有列表选择。
    eventOrder.length = 0
    treeView.selection = [bookmark]
    await openCommand(bookmark)
    assert.deepEqual(eventOrder, ['show'])
    assert.deepEqual(treeView.selection, [bookmark])

    const otherBookmark = { ...bookmark, id: 'other-bookmark' }
    for (const selection of [[], [otherBookmark], [bookmark, otherBookmark]]) {
      eventOrder.length = 0
      treeView.selection = selection
      await open(bookmark)
      assert.deepEqual(eventOrder, ['show'])
      assert.equal(treeView.selection, selection)
    }

    eventOrder.length = 0
    treeView.visible = false
    treeView.selection = [bookmark]
    await open(bookmark)
    assert.deepEqual(eventOrder, ['show'])
    assert.deepEqual(treeView.selection, [bookmark])
    treeView.visible = true

    // 等待文档打开时用户改选或开始多选，保留新的选择。
    for (const replacement of [[otherBookmark], [bookmark, otherBookmark]]) {
      eventOrder.length = 0
      treeView.selection = [bookmark]
      openDocumentHook = () => { treeView.selection = replacement }
      await open(bookmark)
      assert.deepEqual(eventOrder, ['show'])
      assert.equal(treeView.selection, replacement)
    }
    openDocumentHook = () => undefined

    // 打不开文档时也保留原选择，并结束滚动保护。
    eventOrder.length = 0
    treeView.selection = [bookmark]
    const originalOpenTextDocument = vscode.workspace.openTextDocument
    vscode.workspace.openTextDocument = async () => { throw new Error('Missing document') }
    await open(bookmark)
    assert.deepEqual(eventOrder, [])
    assert.deepEqual(treeView.selection, [bookmark])
    assert.equal(navigationInProgress, false)
    vscode.workspace.openTextDocument = originalOpenTextDocument
  } finally {
    restoreModules()
  }
}

main().then(
  () => console.log('Open bookmark node contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
