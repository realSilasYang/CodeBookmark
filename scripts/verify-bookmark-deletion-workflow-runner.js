/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-deletion-workflow-runner`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-deletion-workflow-runner` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-deletion-workflow-runner”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`makeBookmark`、`attach`、`createPort`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
    subs: options.subs,
  })
}

function attach(parent, child) {
  child.parent = parent
  parent.subs.add(child)
}

function createPort(bookmarks, events, targets = []) {
  const containsId = (set, id) => set.values.some(bookmark => bookmark.id === id || containsId(bookmark.subs, id))
  return {
    bookmarks: () => bookmarks,
    resolveTargets: () => targets,
    findBookmark: bookmark => bookmarks.findBookmark(bookmark),
    bookmarkContainsCodeMarker: bookmark => bookmark.isCodeMarker || bookmark.subs.values.some(child => child.isCodeMarker),
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
    'refresh',
  ])
  assert.equal(retainTree.findBookmark(child), child)
  assert.equal(child.parent, file)

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
