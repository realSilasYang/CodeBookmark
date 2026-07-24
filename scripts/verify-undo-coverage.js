/**
 * 检查所有会修改书签的命令都建立撤销记录，并在视图提交后发布正确作用域。
 * 脚本直接调用编译后的 `UndoActions`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const singleFileAIRunner = fs.readFileSync('src/providers/AISingleFileWorkflowRunner.ts', 'utf8')
const folderAIRunner = fs.readFileSync('src/providers/AIFolderWorkflowRunner.ts', 'utf8')
const selectedBookmarksAIRunner = fs.readFileSync('src/providers/AISelectedBookmarksWorkflowRunner.ts', 'utf8')
const manualBookmarkRunner = fs.readFileSync('src/providers/ManualBookmarkWorkflowRunner.ts', 'utf8')
const bookmarkEditingRunner = fs.readFileSync('src/providers/BookmarkEditingWorkflowRunner.ts', 'utf8')
const bookmarkDeletionRunner = fs.readFileSync('src/providers/BookmarkDeletionWorkflowRunner.ts', 'utf8')
const bookmarkTreeInteractionRunner = fs.readFileSync('src/providers/BookmarkTreeInteractionRunner.ts', 'utf8')
const bookmarkImportRunner = fs.readFileSync('src/providers/BookmarkImportWorkflowRunner.ts', 'utf8')
const sourcePathChangeRunner = fs.readFileSync('src/providers/SourcePathChangeWorkflowRunner.ts', 'utf8')
const bookmarkHistoryRunner = fs.readFileSync('src/providers/BookmarkHistoryWorkflowRunner.ts', 'utf8')
const undoImplementation = provider + singleFileAIRunner + folderAIRunner + selectedBookmarksAIRunner
  + manualBookmarkRunner + bookmarkEditingRunner + bookmarkDeletionRunner + bookmarkTreeInteractionRunner + bookmarkImportRunner
const actions = require('../out/util/UndoActions').UNDO_ACTION_MESSAGE_KEYS

const sourceMethod = (source, name, nextName) => {
  const start = source.indexOf(name)
  const end = source.indexOf(nextName, start + name.length)
  assert.ok(start >= 0 && end > start, `无法截取方法：${name}`)
  return source.slice(start, end)
}
const method = (name, nextName) => sourceMethod(provider, name, nextName)
const count = (source, pattern) => (source.match(pattern) || []).length

assert.doesNotMatch(provider, /undoManager\.clear\(/)
assert.equal(count(provider, /undoManager\.saveState\(/g), 1)
assert.match(provider, /private saveUndoState\(action: UndoAction\)/)
// 撤销作用域要等新树和上下文一起提交后才能公布。若在视图仍处于准备阶段时抢先更新，
// 命令标题会短暂引用旧文件夹的历史，用户便可能对错误的作用域执行撤销。
assert.doesNotMatch(method('private commitPreparedBookmarkView(', 'private async publishCommittedViewTransition('), /undoManager\.setActiveScope\(/)
assert.match(method('private async publishCommittedViewTransition(', 'async importBookmarkConfiguration('), /undoManager\.setActiveScope\(this\.currentStorageScope\)/)
assert.match(provider, /relocateUndoPath:[\s\S]*?undoManager\.relocatePath\(/)
assert.match(sourcePathChangeRunner, /port\.relocateUndoPath\(/)
assert.match(bookmarkHistoryRunner, /const affectedPaths = new Set\(\[\.\.\.previousPaths, \.\.\.port\.bookmarkSourcePaths\(\)\]\)/)
assert.match(bookmarkHistoryRunner, /if \(affectedPaths\.size > 0\) port\.saveBookmarks/)
assert.match(bookmarkHistoryRunner, /else port\.saveAllBookmarks\(\)/)

const extension = fs.readFileSync('src/extension.ts', 'utf8')
assert.match(extension, /undoManager\.initialize\(context\)/)
assert.match(extension, /undoManager\.flushPersistence\(\)/)

for (const action of Object.keys(actions).filter(action => action !== 'modifyBookmarks')) {
  assert.match(undoImplementation, new RegExp(`['"]${action}['"]`), `缺少撤销操作类型：${action}`)
}

assert.equal(count(sourceMethod(manualBookmarkRunner, 'export async function runForceAddBookmark(', 'export async function runForceDeleteBookmark('), /saveUndoState\(/g), 1)
assert.equal(count(sourceMethod(manualBookmarkRunner, 'export async function runForceDeleteBookmark(', 'export async function runToggleBookmark('), /saveUndoState\(/g), 1)
assert.equal(count(sourceMethod(manualBookmarkRunner, 'export async function runToggleBookmark(', 'port.refreshDecoration()\n}'), /saveUndoState\(/g), 1)
assert.equal(count(sourceMethod(bookmarkEditingRunner, 'export async function runRenameBookmark(', 'export async function runUpdateBookmarkPosition('), /saveUndoState\(/g), 1)
assert.equal(count(sourceMethod(bookmarkEditingRunner, 'export async function runUpdateBookmarkPosition(', 'export async function runUpdateBookmarkPositionAndRename('), /saveUndoState\(/g), 0)
assert.equal(count(sourceMethod(bookmarkEditingRunner, 'export async function runUpdateBookmarkPositionAndRename(', 'export async function runChangeBookmarkIcons('), /saveUndoState\(/g), 1)
assert.equal(count(sourceMethod(bookmarkEditingRunner, 'export async function runChangeBookmarkIcons(', 'export async function runRestoreDefaultBookmarkIcons('), /saveUndoState\(/g), 1)
assert.equal(count(sourceMethod(bookmarkEditingRunner, 'export async function runRestoreDefaultBookmarkIcons(', 'export async function runTogglePinnedBookmark('), /saveUndoState\(/g), 1)
assert.equal(count(bookmarkEditingRunner.slice(bookmarkEditingRunner.indexOf('export async function runTogglePinnedBookmark(')), /saveUndoState\(/g), 1)
assert.equal(count(sourceMethod(bookmarkEditingRunner, 'function replaceBookmark(', 'export async function runRenameBookmark('), /saveUndoState\(/g), 1)
assert.match(method('public clearInvalidBookmarks(', 'async onDeleteBookmark('), /runClearInvalidBookmarks\(/)
assert.match(method('async onDeleteBookmark(', 'onClickPinView('), /runDeleteBookmarks\(/)
assert.equal(count(sourceMethod(bookmarkDeletionRunner, 'export function runClearInvalidBookmarks(', 'async function confirmDeletion('), /saveUndoState\(/g), 1)
assert.equal(count(bookmarkDeletionRunner.slice(bookmarkDeletionRunner.indexOf('export async function runDeleteBookmarks(')), /saveUndoState\(/g), 1)
assert.match(method('onClickPinView(', 'async onRenameDirectory('), /runTogglePinnedBookmark\(/)

assert.equal(count(selectedBookmarksAIRunner, /saveUndoState\('optimizeAIBookmarks'\)/g), 1)
assert.equal(count(selectedBookmarksAIRunner, /let hasSavedUndoState = false/g), 1)
assert.equal(count(folderAIRunner, /saveUndoState\('generateAIBookmarks'\)/g), 1)
assert.equal(count(folderAIRunner, /saveUndoState\('optimizeAIBookmarks'\)/g), 1)
assert.equal(count(folderAIRunner, /let hasSavedUndoState = false/g), 2)

const drop = sourceMethod(bookmarkTreeInteractionRunner, 'async function moveNodes(', 'export async function runBookmarkTreeDrop(')
assert.match(drop, /commitUndoState\(captured, isFileReorder \? 'reorderFiles' : 'moveBookmarks'\)/)

const importMethod = bookmarkImportRunner.slice(bookmarkImportRunner.indexOf('export async function runImportBookmarkConfiguration('))
assert.match(importMethod, /const captured = port\.captureUndoState\(\)/)
assert.match(importMethod, /port\.commitImportUndo\(captured\)/)

const externalRename = sourceMethod(sourcePathChangeRunner, 'export async function runRenamedSourcePath(', 'export function runDeletedSourcePath(')
const externalDelete = sourcePathChangeRunner.slice(sourcePathChangeRunner.indexOf('export function runDeletedSourcePath('))
assert.doesNotMatch(externalRename, /saveUndoState\(/)
assert.doesNotMatch(externalDelete, /saveUndoState\(/)
assert.match(method('async onRenameDirectory(', 'onDeleteDirectory('), /runRenamedSourcePath\(/)
assert.match(method('onDeleteDirectory(', 'private bookmarkHistoryWorkflowPort('), /runDeletedSourcePath\(/)
assert.match(method('async undo(', 'async redo('), /runBookmarkHistoryOperation\('undo'/)
assert.match(method('async redo(', 'dispose()'), /runBookmarkHistoryOperation\('redo'/)
