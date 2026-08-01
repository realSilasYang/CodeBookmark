/**
 * 验证书签跳转使用扩展自己的 showTextDocument 打开流程。
 * 普通未打开目标始终打开为固定标签；已打开的目标文件继续复用原编辑器列。
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
const window = {
  activeTextEditor: activeEditor,
  visibleTextEditors: [activeEditor],
  tabGroups,
  showTextDocument: async (document, options) => {
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
    openTextDocument: async fileUri => documentFor(fileUri),
  },
  commands: {
    registerCommand: (command, handler) => { commands.set(command, handler); return { dispose() {} } },
    executeCommand: async command => { throw new Error(`Unexpected command execution: ${command}`) },
  },
})
const restoreModules = installModuleMocks({
  vscode,
  '../util/FileUtils': { fileUtils: { relativeToUri: bookmarkPath => bookmarkPath === 'src/target.ts' ? targetUri : uri(bookmarkPath) } },
})

async function main() {
  try {
    const { openNodeCommand } = require('../out/commands/openNodeCommand')
    openNodeCommand({ subscriptions: [] })
    const open = [...commands.values()][0]
    assert.equal(typeof open, 'function')
    const bookmark = {
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
