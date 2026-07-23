/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-undo-state`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-undo-state` 对应契约。
 * 核心边界：通过断言锁定“verify-undo-state”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`verifySessionPersistence`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')
const path = require('node:path')

const contextValues = new Map()

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}

class MarkdownString {
  appendMarkdown() {}
  appendText() {}
  appendCodeblock() {}
}

const vscodeMock = {
  env: { sessionId: 'undo-session-a' },
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {},
  ThemeColor: class {},
  MarkdownString,
  Uri: { file: fsPath => ({ fsPath }) },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
    getConfiguration: () => ({ get: () => undefined }),
  },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
  },
  commands: {
    executeCommand: async (command, key, value) => {
      if (command === 'setContext') contextValues.set(key, value)
    },
  },
}

installModuleMocks({ vscode: vscodeMock })

const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { ContextBookmark } = require('../out/util/ContextValue')
const { UndoManager } = require('../out/providers/UndoManager')
const { isScriptId } = require('../out/util/ScriptIdentity')
const localization = require('../out/i18n/Localization')

const child = new Bookmark({
  id: 'bookmark-1',
  label: 'Bookmark',
  path: 'src/example.ts',
  start: new CursorIndex(3, 0),
  end: new CursorIndex(3, 0),
})
const fileNode = new Bookmark({
  id: 'file_src/example.ts',
  path: 'src/example.ts',
  contextValue: ContextBookmark.File,
  subs: new BookmarkSet([child]),
  collapsible: vscodeMock.TreeItemCollapsibleState.Expanded,
})
child.parent = fileNode

const bookmarks = new BookmarkSet([fileNode])
const manager = new UndoManager()
manager.saveState(bookmarks)
bookmarks.clear()

assert.deepEqual(manager.undo(bookmarks), { action: 'modifyBookmarks', workspaceOrder: null })
assert.equal(bookmarks.size, 1)
assert.equal(bookmarks.values[0].contextValue, ContextBookmark.File)
assert.equal(bookmarks.values[0].subs.values[0].parent, bookmarks.values[0])
assert.deepEqual(manager.redo(bookmarks), { action: 'modifyBookmarks', workspaceOrder: null })
assert.equal(bookmarks.size, 0)
manager.clear()
assert.equal(manager.canUndo(), false)
assert.equal(manager.canRedo(), false)
localization.initializeLocalization('en')
assert.throws(() => Bookmark.fromJSON({ id: 'incomplete' }), /creation time/)
localization.initializeLocalization('zh-cn')
assert.throws(() => Bookmark.fromJSON({ id: 'incomplete' }), /书签创建时间无效/)

const malformedManager = new UndoManager()
const malformedState = malformedManager.captureState(bookmarks)
malformedState.state = '{not-json'
malformedManager.commitCapturedState(malformedState, 'modifyBookmarks')
const unchangedTree = new BookmarkSet([child])
const originalConsoleError = console.error
console.error = () => undefined
try {
  assert.equal(malformedManager.undo(unchangedTree), undefined)
} finally {
  console.error = originalConsoleError
}
assert.equal(malformedManager.canUndo(), true)
assert.equal(unchangedTree.values[0], child)

const nestedChild = new Bookmark({ id: 'generated-child', label: 'Child', path: 'src/example.ts' })
const generatedRoot = new Bookmark({
  id: 'generated-root',
  label: 'Generated root',
  path: 'src/example.ts',
  subs: new BookmarkSet([nestedChild]),
})
nestedChild.parent = generatedRoot
const pinnedContainer = new Bookmark({
  id: 'pinned-container',
  label: 'Pinned',
  path: 'src/example.ts',
  isPinned: true,
})
const pinnedFile = new Bookmark({
  id: 'file_pinned',
  path: 'src/example.ts',
  contextValue: ContextBookmark.File,
  subs: new BookmarkSet([pinnedContainer]),
  collapsible: vscodeMock.TreeItemCollapsibleState.Expanded,
})
pinnedContainer.parent = pinnedFile
const pinnedTree = new BookmarkSet([pinnedFile])

assert.equal(pinnedFile.contextValue, ContextBookmark.File)
assert.equal(pinnedFile.isPinned, false)
assert.equal(pinnedFile.collapsibleState, vscodeMock.TreeItemCollapsibleState.Expanded)

assert.equal(pinnedTree.addNewBookmark(generatedRoot), pinnedContainer)
assert.equal(pinnedContainer.subs.values[0], generatedRoot)
assert.equal(generatedRoot.parent, pinnedContainer)
assert.equal(nestedChild.parent, generatedRoot)
assert.equal(generatedRoot.level, 2)
assert.equal(nestedChild.level, 3)
generatedRoot.collapsibleState = vscodeMock.TreeItemCollapsibleState.Expanded
generatedRoot.refreshDisplayProps()
assert.equal(generatedRoot.collapsibleState, vscodeMock.TreeItemCollapsibleState.Expanded)
assert.equal(Bookmark.fromJSON(generatedRoot.toJSON()).collapsibleState, vscodeMock.TreeItemCollapsibleState.Expanded)

const otherFileBookmark = new Bookmark({ id: 'other-file', label: 'Other', path: 'src\\nested\\..\\other.ts' })
assert.equal(pinnedTree.addNewBookmark(otherFileBookmark), undefined)
const otherFileNode = pinnedTree.values.find(item => item.path === 'src/other.ts')
assert.ok(otherFileNode)
assert.equal(otherFileNode.isFile, true)
assert.equal(otherFileNode.id, `file_${otherFileNode.scriptId}`)
assert.equal(isScriptId(otherFileNode.scriptId), true)
assert.equal(otherFileNode.label, 'other.ts')
assert.equal(otherFileNode.createdAt, otherFileBookmark.createdAt)
assert.equal(otherFileNode.collapsibleState, vscodeMock.TreeItemCollapsibleState.Expanded)
assert.deepEqual(otherFileNode.subs.values, [otherFileBookmark])
assert.equal(otherFileBookmark.path, 'src/other.ts')
assert.equal(otherFileBookmark.parent, otherFileNode)
assert.equal(pinnedContainer.subs.has(otherFileBookmark), false)

const first = new Bookmark({ id: 'move-first', label: 'First', path: 'src/move.ts' })
const second = new Bookmark({ id: 'move-second', label: 'Second', path: 'src/move.ts' })
const moveFile = new Bookmark({
  id: 'file_src/move.ts',
  path: 'src/move.ts',
  contextValue: ContextBookmark.File,
  subs: new BookmarkSet([first, second]),
  collapsible: vscodeMock.TreeItemCollapsibleState.Expanded,
})
first.parent = moveFile
second.parent = moveFile
const moveTree = new BookmarkSet([moveFile])
assert.equal(moveTree.moveGroupToNode(new BookmarkSet([first, second]), moveFile), false)
assert.equal(moveTree.values[0], moveFile)
assert.deepEqual(moveFile.subs.values.map(item => item.id), ['move-first', 'move-second'])
assert.equal(moveTree.changeIndexNode(new BookmarkSet([second]), first), true)
assert.deepEqual(moveFile.subs.values.map(item => item.id), ['move-second', 'move-first'])

const scopedManager = new UndoManager()
const scopeA = 'file:/scope-a.ts'
const scopeB = 'file:/scope-b.ts'
const treeA = new BookmarkSet([fileNode])
scopedManager.setActiveScope(scopeA)
scopedManager.saveState(treeA, 'deleteBookmarks', scopeA)
treeA.clear()
assert.equal(scopedManager.undoAction(scopeA), 'deleteBookmarks')

scopedManager.setActiveScope(scopeB)
assert.equal(scopedManager.canUndo(), false)
assert.equal(scopedManager.canUndo(scopeA), true)
const treeB = new BookmarkSet([pinnedFile])
scopedManager.saveState(treeB, 'changeBookmarkIcons', scopeB)
treeB.clear()
assert.equal(scopedManager.undoAction(scopeB), 'changeBookmarkIcons')

scopedManager.setActiveScope(scopeA)
assert.deepEqual(scopedManager.undo(treeA, scopeA), { action: 'deleteBookmarks', workspaceOrder: null })
assert.equal(treeA.size, 1)
assert.equal(scopedManager.canUndo(scopeB), true)
scopedManager.setActiveScope(scopeB)
assert.deepEqual(scopedManager.undo(treeB, scopeB), { action: 'changeBookmarkIcons', workspaceOrder: null })
assert.equal(treeB.size, 1)

const orderManager = new UndoManager()
const orderScope = 'workspace:/example'
orderManager.setActiveScope(orderScope)
orderManager.saveState(moveTree, 'reorderFiles', orderScope, ['src/a.ts', 'src/b.ts'])
const undoOrder = orderManager.undo(moveTree, orderScope, ['src/b.ts', 'src/a.ts'])
assert.deepEqual(undoOrder, { action: 'reorderFiles', workspaceOrder: ['src/a.ts', 'src/b.ts'] })
const redoOrder = orderManager.redo(moveTree, orderScope, ['src/a.ts', 'src/b.ts'])
assert.deepEqual(redoOrder, { action: 'reorderFiles', workspaceOrder: ['src/b.ts', 'src/a.ts'] })

const oldAbsolutePath = path.resolve('renamed-before.ts')
const newAbsolutePath = path.resolve('renamed-after.ts')
const scopePath = value => `file:${path.resolve(value)}`
const renamedChild = new Bookmark({ id: 'renamed-bookmark', label: 'Renamed', path: oldAbsolutePath })
const renamedFile = new Bookmark({
  id: 'file_renamed', path: oldAbsolutePath, contextValue: ContextBookmark.File,
  scriptId: '10000000-0000-9000-1000-000000000091',
  subs: new BookmarkSet([renamedChild]), collapsible: vscodeMock.TreeItemCollapsibleState.Expanded,
})
renamedChild.parent = renamedFile
const renamedTree = new BookmarkSet([renamedFile])
const relocationManager = new UndoManager()
relocationManager.setActiveScope(scopePath(oldAbsolutePath))
relocationManager.saveState(renamedTree, 'addBookmarks', scopePath(oldAbsolutePath))
renamedTree.clear()
relocationManager.relocatePath(
  scopePath(oldAbsolutePath), scopePath(newAbsolutePath),
  oldAbsolutePath, newAbsolutePath, oldAbsolutePath, newAbsolutePath,
)
assert.equal(relocationManager.canUndo(scopePath(oldAbsolutePath)), false)
assert.equal(relocationManager.canUndo(scopePath(newAbsolutePath)), true)
const relocationResult = relocationManager.undo(renamedTree, scopePath(newAbsolutePath))
assert.equal(relocationResult.action, 'addBookmarks')
assert.equal(path.resolve(renamedTree.values[0].path), newAbsolutePath)
assert.equal(path.resolve(renamedTree.values[0].subs.values[0].path), newAbsolutePath)
assert.equal(renamedTree.values[0].scriptId, '10000000-0000-9000-1000-000000000091')

const crossScopeManager = new UndoManager()
const oldWorkspaceScope = 'workspace:/old-workspace'
const newWorkspaceScope = 'workspace:/new-workspace'
const movedWorkspacePath = 'src/moved.ts'
const retainedWorkspacePath = 'src/retained.ts'
const movedWorkspaceFile = new Bookmark({
  id: 'file_moved_workspace', path: movedWorkspacePath, contextValue: ContextBookmark.File,
  scriptId: '10000000-0000-9000-1000-000000000092',
  subs: new BookmarkSet([new Bookmark({ id: 'moved-child', label: 'Moved', path: movedWorkspacePath })]),
})
const retainedWorkspaceFile = new Bookmark({
  id: 'file_retained_workspace', path: retainedWorkspacePath, contextValue: ContextBookmark.File,
  scriptId: '10000000-0000-9000-1000-000000000093',
  subs: new BookmarkSet([new Bookmark({ id: 'retained-child', label: 'Retained', path: retainedWorkspacePath })]),
})
const crossScopeTree = new BookmarkSet([movedWorkspaceFile, retainedWorkspaceFile])
crossScopeManager.saveState(
  crossScopeTree,
  'modifyBookmarks',
  oldWorkspaceScope,
  [movedWorkspacePath, retainedWorkspacePath],
)
crossScopeManager.relocatePath(
  oldWorkspaceScope,
  newWorkspaceScope,
  movedWorkspacePath,
  'moved.ts',
  path.resolve('old-workspace', movedWorkspacePath),
  path.resolve('new-workspace', 'moved.ts'),
)
assert.equal(crossScopeManager.canUndo(oldWorkspaceScope), true)
assert.equal(crossScopeManager.canUndo(newWorkspaceScope), false)
const retainedOnlyTree = new BookmarkSet()
const retainedUndo = crossScopeManager.undo(retainedOnlyTree, oldWorkspaceScope, [retainedWorkspacePath])
assert.equal(retainedUndo.action, 'modifyBookmarks')
assert.deepEqual(retainedOnlyTree.values.map(item => item.path), [retainedWorkspacePath])
assert.deepEqual(retainedUndo.workspaceOrder, [retainedWorkspacePath])

const budgetManager = new UndoManager()
for (let index = 0; index < 70; index++) {
  const scope = `file:/budget-${index}.ts`
  const largeBookmark = new Bookmark({
    id: `budget-${index}`,
    label: `Budget ${index}`,
    path: `/budget-${index}.ts`,
    content: 'x'.repeat(256 * 1024),
  })
  budgetManager.setActiveScope(scope)
  budgetManager.saveState(new BookmarkSet([largeBookmark]), 'modifyBookmarks', scope)
}
assert.ok(budgetManager.totalHistoryBytes <= 8 * 1024 * 1024)
assert.ok(budgetManager.scopes.size <= 64)

const oversizedManager = new UndoManager()
const oversizedBookmark = new Bookmark({
  id: 'oversized-undo', label: 'Oversized', path: '/oversized.ts', content: 'x'.repeat(9 * 1024 * 1024),
})
oversizedManager.saveState(new BookmarkSet([oversizedBookmark]))
assert.equal(oversizedManager.canUndo(), false)

const persistedState = new Map()
let persistenceUpdateCount = 0
const extensionContext = {
  workspaceState: {
    get: key => persistedState.get(key),
    update: async (key, value) => {
      persistenceUpdateCount++
      persistedState.set(key, value)
    },
  },
}
async function verifySessionPersistence() {
  const persistedManager = new UndoManager()
  persistedManager.initialize(extensionContext)
  persistedManager.setActiveScope(scopeA)
  persistedManager.saveState(new BookmarkSet([fileNode]), 'deleteBookmarks', scopeA)
  await persistedManager.flushPersistence()
  assert.equal(persistenceUpdateCount, 1)
  const persistedSession = persistedState.get('codebookmark.undoSessionState')
  assert.equal(persistedSession.format, 'codebookmark.undo-session')
  assert.equal(persistedSession.schemaVersion, 1)
  await persistedManager.flushPersistence()
  assert.equal(persistenceUpdateCount, 1, 'Unchanged undo state must not be persisted again')

  const reactivatedManager = new UndoManager()
  reactivatedManager.initialize(extensionContext)
  assert.equal(reactivatedManager.canUndo(scopeA), true)
  assert.equal(reactivatedManager.undoAction(scopeA), 'deleteBookmarks')
  await reactivatedManager.flushPersistence()
  assert.equal(persistenceUpdateCount, 2)
  await reactivatedManager.flushPersistence()
  assert.equal(persistenceUpdateCount, 2, 'Reactivated unchanged state must not be persisted again')

  vscodeMock.env.sessionId = 'undo-session-b'
  const restartedManager = new UndoManager()
  restartedManager.initialize(extensionContext)
  assert.equal(restartedManager.canUndo(scopeA), false)
  await restartedManager.flushPersistence()
  assert.equal(persistenceUpdateCount, 3)
}

verifySessionPersistence().catch(error => {
  console.error(error)
  process.exitCode = 1
})
