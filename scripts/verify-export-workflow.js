/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-export-workflow`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-export-workflow` 对应契约。
 * 核心边界：通过断言锁定“verify-export-workflow”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const commands = new Map()
const informationMessages = []
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-export-workflow-'))
const sourcePath = path.join(sandbox, 'source.ts')
const outputPath = path.join(sandbox, 'bookmarks.md')
fs.writeFileSync(sourcePath, 'const root = true\nuse(root)\n', 'utf8')

const { vscode } = createVscodeFake({
  commands: {
    registerCommand: (command, handler) => {
      commands.set(command, handler)
      return { dispose() {} }
    },
  },
  window: {
    activeTextEditor: { document: { uri: { scheme: 'file', fsPath: sourcePath } } },
    showSaveDialog: async () => ({ scheme: 'file', fsPath: outputPath }),
    showInformationMessage: message => { informationMessages.push(message) },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { ContextBookmark } = require('../out/util/ContextValue')
const { registerExportCommand } = require('../out/commands/exportCommand')
restoreModules()

async function main() {
  const file = new Bookmark({
    id: 'file',
    path: sourcePath,
    contextValue: ContextBookmark.File,
    scriptId: '10000000-0000-9000-8000-000000000001',
  })
  const root = new Bookmark({
    id: 'root',
    path: sourcePath,
    label: 'Root',
    parent: file,
    start: new CursorIndex(0, 0),
    end: new CursorIndex(0, 4),
  })
  const child = new Bookmark({
    id: 'child',
    path: sourcePath,
    label: 'Child',
    parent: root,
    start: new CursorIndex(1, 0),
    end: new CursorIndex(1, 3),
  })
  root.subs.add(child)
  file.subs.add(root)

  const context = { subscriptions: { push() {} } }
  registerExportCommand(context, { codeBookmarks: new BookmarkSet([file]) })
  await commands.get('codebookmark.exportToMarkdown')()

  assert.equal(fs.existsSync(outputPath), true)
  assert.match(fs.readFileSync(outputPath, 'utf8'), /共 2 个书签/)
  assert.equal(
    informationMessages.at(-1),
    '书签导出完成，导出结果：共 2 个书签：一级 1 个、二级 1 个；文件：bookmarks.md。',
  )
}

main().then(
  () => console.log('Export workflow contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
