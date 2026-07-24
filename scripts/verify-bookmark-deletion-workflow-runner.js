/**
 * 覆盖选中删除、子树删除和失效书签清理的确认、撤销、保存与分级统计。
 * 为核对选中删除、子树删除和失效书签清理的确认、撤销、保存与分级统计，脚本直接调用编译后的 `Bookmark`、`BookmarkSet`、`ContextValue`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const informationMessages = []
const warningMessages = []
const promptResults = []
const { vscode } = createVscodeFake({
  window: {
    showInformationMessage: async (message, ...choices) => {
      informationMessages.push(message)
      const mode = promptResults.shift()
      return choices.find(choice => choice.mode === mode)
    },
    showWarningMessage: message => { warningMessages.push(message) },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { Bookmark } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { ContextBookmark } = require('../out/util/ContextValue')
const {
  hasInvalidBookmarks,
  runClearInvalidBookmarks,
  runDeleteBookmarks,
} = require('../out/providers/BookmarkDeletionWorkflowRunner')
restoreModules()

function makeBookmark(id, options = {}) {
  return new Bookmark({
    id,
    label: id,
    path: options.path ?? `src/${id}.ts`,
    isInvalid: options.invalid,
    codeMarker: options.codeMarker,
    contextValue: options.contextValue,
    scriptId: options.scriptId,
    ownerScriptId: options.ownerScriptId,
    subs: options.subs,
  })
}

function attach(parent, child) {
  child.parent = parent
  parent.subs.add(child)
}

function createPort(bookmarks, events, targets = []) {
  const containsId = (set, id) => set.values.some(bookmark => bookmark.id === id || containsId(bookmark.subs, id))
  const containsCodeMarker = bookmark => bookmark.isCodeMarker || bookmark.subs.values.some(containsCodeMarker)
  return {
    bookmarks: () => bookmarks,
    resolveTargets: () => targets,
    findBookmark: bookmark => bookmarks.findBookmark(bookmark),
    bookmarkContainsCodeMarker: containsCodeMarker,
    warnProtectedCodeMarkers: count => events.push(`warn:${count}`),
    deleteBookmark: id => {
      events.push(`delete:${id}`)
      return containsId(bookmarks, id)
        ? (bookmarks.deleteBookmark(id), true)
        : false
    },
    absoluteBookmarkPath: filePath => `C:\\workspace\\${filePath}`,
    saveUndoState: action => events.push(`undo:${action}`),
    saveBookmarks: paths => events.push(`save:${paths.join('|')}`),
    refreshDecoration: () => events.push('refresh'),
    hideFileNode: scriptId => events.push(`hide:${scriptId}`),
    commitTopology: async () => { events.push('commit') },
  }
}

async function main() {
  const invalid = makeBookmark('invalid', { invalid: true })
  const protectedInvalid = makeBookmark('protected-invalid', { invalid: true, codeMarker: { marker: 'TODO' } })
  const invalidChild = makeBookmark('invalid-child', { invalid: true })
  const validParent = makeBookmark('valid-parent', { subs: new BookmarkSet([invalidChild]) })
  invalidChild.parent = validParent
  const clearTree = new BookmarkSet([invalid, protectedInvalid, validParent])
  const clearEvents = []
  const clearPort = createPort(clearTree, clearEvents)
  assert.equal(hasInvalidBookmarks(clearTree), true)
  runClearInvalidBookmarks(clearPort)
  assert.deepEqual(clearEvents, [
    'warn:1',
    'undo:clearInvalidBookmarks',
    'delete:invalid',
    'delete:invalid-child',
    'refresh',
    'save:C:\\workspace\\src/invalid.ts|C:\\workspace\\src/invalid-child.ts',
  ])
  assert.equal(clearTree.findBookmark(protectedInvalid) !== undefined, true)
  assert.equal(hasInvalidBookmarks(new BookmarkSet([protectedInvalid])), true)

  const first = makeBookmark('first')
  const second = makeBookmark('second')
  const multipleTree = new BookmarkSet([first, second])
  const multipleEvents = []
  await runDeleteBookmarks(first, [first, second], createPort(multipleTree, multipleEvents, [first, second]))
  assert.deepEqual(multipleEvents, [
    'undo:deleteBookmarks',
    'delete:first',
    'delete:second',
    'save:C:\\workspace\\src/first.ts|C:\\workspace\\src/second.ts',
    'commit',
    'refresh',
  ])
  assert.equal(informationMessages.at(-1), '批量删除完成，删除结果：共 2 个书签：一级 2 个。')

  const nestedParent = makeBookmark('nested-parent')
  const nestedChild = makeBookmark('nested-child')
  const nestedSibling = makeBookmark('nested-sibling')
  attach(nestedParent, nestedChild)
  const nestedTree = new BookmarkSet([nestedParent, nestedSibling])
  const nestedEvents = []
  promptResults.push('delete')
  await runDeleteBookmarks(
    nestedParent,
    [nestedParent, nestedSibling],
    createPort(nestedTree, nestedEvents, [nestedParent, nestedSibling]),
  )
  assert.equal(informationMessages.at(-1), '批量删除完成，删除结果：共 3 个书签：一级 2 个、二级 1 个。')

  const file = makeBookmark('file', { contextValue: ContextBookmark.File })
  const folder = makeBookmark('folder')
  const child = makeBookmark('child')
  attach(folder, child)
  attach(file, folder)
  const retainTree = new BookmarkSet([file])
  const retainEvents = []
  promptResults.push('keepChildren')
  await runDeleteBookmarks(folder, [folder, child], createPort(retainTree, retainEvents, [folder, child]))
  assert.deepEqual(retainEvents, [
    'undo:deleteBookmarks',
    'delete:folder',
    'save:C:\\workspace\\src/folder.ts',
    'commit',
    'refresh',
  ])
  assert.equal(retainTree.findBookmark(child), child)
  assert.equal(child.parent, file)

  const fileA = makeBookmark('file-a', {
    path: 'src/a.ts',
    contextValue: ContextBookmark.File,
    scriptId: 'script-a',
  })
  const bookmarkA = makeBookmark('bookmark-a', { path: 'src/a.ts', ownerScriptId: 'script-a' })
  const fileB = makeBookmark('file-b', {
    path: 'src/b.ts',
    contextValue: ContextBookmark.File,
    scriptId: 'script-b',
  })
  const bookmarkB = makeBookmark('bookmark-b', { path: 'src/b.ts', ownerScriptId: 'script-b' })
  const protectedB = makeBookmark('todo-b', {
    path: 'src/b.ts',
    ownerScriptId: 'script-b',
    codeMarker: { marker: 'TODO' },
  })
  attach(fileA, bookmarkA)
  attach(bookmarkA, fileB)
  attach(fileB, bookmarkB)
  attach(bookmarkB, protectedB)
  const crossScriptTree = new BookmarkSet([fileA])
  const crossScriptEvents = []
  promptResults.push('delete')
  await runDeleteBookmarks(fileA, undefined, createPort(crossScriptTree, crossScriptEvents, [fileA]))
  assert.equal(crossScriptTree.findBookmark(bookmarkA), undefined)
  assert.equal(crossScriptTree.findBookmark(bookmarkB), undefined)
  assert.equal(crossScriptTree.findBookmark(protectedB), protectedB)
  assert.equal(protectedB.parent, undefined)
  assert.deepEqual(crossScriptEvents, [
    'undo:deleteBookmarks',
    'warn:1',
    'hide:script-a',
    'hide:script-b',
    'hide:script-a',
    'delete:file-a',
    'save:C:\\workspace\\src/a.ts',
    'commit',
    'refresh',
  ])

  const protectedTree = new BookmarkSet([makeBookmark('protected', { codeMarker: { marker: 'TODO' } })])
  const protectedEvents = []
  await runDeleteBookmarks(protectedTree.values[0], undefined, createPort(protectedTree, protectedEvents, protectedTree.values))
  assert.deepEqual(protectedEvents, ['warn:1'])

  const cancelledTree = new BookmarkSet([makeBookmark('cancelled')])
  const cancelledEvents = []
  const cancelled = cancelledTree.values[0]
  const container = makeBookmark('container')
  attach(container, cancelled)
  const root = new BookmarkSet([container])
  promptResults.push('cancel')
  await runDeleteBookmarks(container, undefined, createPort(root, cancelledEvents, [container]))
  assert.deepEqual(cancelledEvents, [])
  assert.equal(root.findBookmark(container), container)
}

main().then(
  () => console.log('BookmarkDeletionWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
