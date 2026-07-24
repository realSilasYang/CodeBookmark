/**
 * 验证书签跳转会复用已经打开的目标标签，并把尚未打开的跨文件目标创建为固定新标签。
 * 测试通过命令注册入口执行真实跳转策略，同时核对可见编辑器优先于后台标签组。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const commands = new Map()
const shown = []
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
const activeEditor = { document: documentFor(sourceUri), viewColumn: 1 }
const tabGroups = { all: [] }
const window = {
  activeTextEditor: activeEditor,
  visibleTextEditors: [activeEditor],
  tabGroups,
  showTextDocument: async (document, options) => {
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
  workspace: { openTextDocument: async fileUri => documentFor(fileUri) },
  commands: { registerCommand: (command, handler) => { commands.set(command, handler); return { dispose() {} } } },
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

    await open(bookmark)
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
