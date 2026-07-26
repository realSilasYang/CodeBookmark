/**
 * 覆盖单文件与文件夹导出的格式选择、取消、目标路径、冲突和最终统计。
 * 为核对单文件与文件夹导出的格式选择、取消、目标路径、冲突和最终统计，脚本在临时目录中调用编译后的 `Bookmark`、`BookmarkSet`、`ContextValue` 完成真实操作，检查落盘结果而不是内存假象。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const commands = new Map()
const informationMessages = []
const errorMessages = []
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-export-workflow-'))
const sourcePath = path.join(sandbox, 'source.ts')
const outputPath = path.join(sandbox, 'bookmarks.md')
const batchParent = path.join(sandbox, 'batch-output')
let saveTarget = outputPath
fs.writeFileSync(sourcePath, 'const root = true\nuse(root)\n', 'utf8')
fs.mkdirSync(batchParent)

const { vscode } = createVscodeFake({
  commands: {
    registerCommand: (command, handler) => {
      commands.set(command, handler)
      return { dispose() {} }
    },
  },
  window: {
    activeTextEditor: { document: { uri: { scheme: 'file', fsPath: sourcePath } } },
    showSaveDialog: async () => ({ scheme: 'file', fsPath: saveTarget }),
    showOpenDialog: async () => [{ scheme: 'file', fsPath: batchParent }],
    withProgress: async (_options, task) => task({ report() {} }),
    showInformationMessage: message => { informationMessages.push(message) },
    showErrorMessage: message => { errorMessages.push(message) },
  },
  ProgressLocation: { Notification: 1 },
})
const restoreModules = installModuleMocks({ vscode })
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { ContextBookmark } = require('../out/util/ContextValue')
const { registerExportCommand } = require('../out/commands/exportCommand')
const { storageRootState } = require('../out/util/StorageRootState')
const { readPortableArchive } = require('../out/portable/PortableArchive')
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

  const sourceA = path.join(sandbox, 'a.ts')
  const sourceB = path.join(sandbox, 'b.ts')
  fs.writeFileSync(sourceA, 'const a = true\n')
  fs.writeFileSync(sourceB, 'const b = true\n')
  const scriptA = '10000000-0000-9000-8000-000000000011'
  const scriptB = '10000000-0000-9000-8000-000000000012'
  const fileA = new Bookmark({ id: 'file-a', path: sourceA, contextValue: ContextBookmark.File, scriptId: scriptA })
  const fileB = new Bookmark({ id: 'file-b', path: sourceB, contextValue: ContextBookmark.File, scriptId: scriptB })
  const bookmarkA = new Bookmark({
    id: 'bookmark-a', path: sourceA, label: 'Owned by A', ownerScriptId: scriptA,
    start: new CursorIndex(0, 0), end: new CursorIndex(0, 5),
  })
  const bookmarkB = new Bookmark({
    id: 'bookmark-b', path: sourceB, label: 'Owned by B', ownerScriptId: scriptB,
    start: new CursorIndex(0, 0), end: new CursorIndex(0, 5),
  })
  fileB.subs.add(bookmarkA)
  bookmarkA.subs.add(bookmarkB)
  registerExportCommand(context, { codeBookmarks: new BookmarkSet([fileA, fileB]) })
  await commands.get('codebookmark.batchExportToMarkdown')()

  const batchFolder = fs.readdirSync(batchParent).map(name => path.join(batchParent, name))[0]
  const outputA = path.join(batchFolder, 'a.ts.bookmarks.md')
  const outputB = path.join(batchFolder, 'b.ts.bookmarks.md')
  assert.equal(fs.existsSync(outputA), true)
  assert.equal(fs.existsSync(outputB), true)
  assert.match(fs.readFileSync(outputA, 'utf8'), /Owned by A/)
  assert.doesNotMatch(fs.readFileSync(outputA, 'utf8'), /Owned by B/)
  assert.match(fs.readFileSync(outputB, 'utf8'), /Owned by B/)
  assert.doesNotMatch(fs.readFileSync(outputB, 'utf8'), /Owned by A/)
  assert.match(informationMessages.at(-1), /共 2 个书签：一级 2 个/)

  const portableSource = path.join(sandbox, 'portable.ts')
  const storageRoot = path.join(sandbox, 'portable-storage')
  const portableOutput = path.join(sandbox, 'portable.codebookmark')
  fs.writeFileSync(portableSource, 'export const portable = true\n')
  storageRootState.activate(storageRoot)
  const portableScriptId = '10000000-0000-4000-8000-000000000021'
  const portableBookmarkId = '20000000-0000-4000-8000-000000000021'
  const portableFile = new Bookmark({
    id: `file_${portableScriptId}`, path: portableSource,
    contextValue: ContextBookmark.File, scriptId: portableScriptId,
  })
  portableFile.subs.add(new Bookmark({
    id: portableBookmarkId, path: portableSource, label: 'Portable export', ownerScriptId: portableScriptId,
    content: 'export const portable = true', start: new CursorIndex(0, 0), end: new CursorIndex(0, 28),
  }))
  const portableBookmarks = new BookmarkSet([portableFile])
  registerExportCommand(context, {
    codeBookmarks: portableBookmarks,
    flushPendingSaves: async () => {},
    portableExportSnapshot: () => ({
      bookmarks: portableBookmarks,
      storageScope: `file:${portableSource}`,
      scopeFilePath: portableSource,
    }),
  })
  saveTarget = portableOutput
  await commands.get('codebookmark.exportPortablePackage')()
  const archive = await readPortableArchive(fs.readFileSync(portableOutput))
  assert.equal(archive.scripts.get(portableScriptId).bookmarks[0].label, 'Portable export')
  const exchangeFolder = path.join(storageRoot, 'exchanges')
  const exchangeName = fs.readdirSync(exchangeFolder)[0]
  const exchangePath = path.join(exchangeFolder, exchangeName)
  const exchangeBeforeFailure = fs.readFileSync(exchangePath, 'utf8')

  const directoryTarget = path.join(sandbox, 'directory-target.codebookmark')
  fs.mkdirSync(directoryTarget)
  saveTarget = directoryTarget
  await commands.get('codebookmark.exportPortablePackage')()
  assert.equal(fs.statSync(directoryTarget).isDirectory(), true)
  assert.equal(fs.readFileSync(exchangePath, 'utf8'), exchangeBeforeFailure)
  assert.match(errorMessages.at(-1), /导出失败/)
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
