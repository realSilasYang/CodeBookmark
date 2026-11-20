/**
 * 覆盖拖放、展开收起、搜索和排序选择的合法路径及所有拒绝边界。
 * 脚本直接调用编译后的 `Bookmark`、`BookmarkSet`、`ViewMode`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

class DataTransferItem {
  constructor(value) {
    this.value = value
  }
}

class DataTransfer {
  constructor() {
    this.items = new Map()
  }

  get(mimeType) {
    return this.items.get(mimeType)
  }

  set(mimeType, item) {
    this.items.set(mimeType, item)
  }
}

const warningMessages = []
const informationMessages = []
const quickPickCalls = []
const commandCalls = []
let quickPickSelector = () => undefined

const { vscode } = createVscodeFake({
  DataTransferItem,
  window: {
    activeTextEditor: undefined,
    showWarningMessage: message => { warningMessages.push(message) },
    showInformationMessage: message => { informationMessages.push(message) },
    showQuickPick: async (items, options) => {
      quickPickCalls.push({ items, options })
      return quickPickSelector(items)
    },
  },
  commands: {
    executeCommand: async (...args) => { commandCalls.push(args) },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { bookmarkSortPreference, SortModeBookmark } = require('../out/models/ViewMode')
const { ExtensionStateKeys } = require('../out/util/constants/ExtensionStateKeys')
const { ContextBookmark } = require('../out/util/ContextValue')
const {
  BOOKMARK_TREE_MIME_TYPE,
  publishExpandCollapseContext,
  runBookmarkTreeDrag,
  runBookmarkTreeDrop,
  runExpandFolderTreeView,
  runSearchBookmarksInActiveFile,
  runSelectBookmarkSortMode,
  runToggleExpandCollapse,
  sortBookmarkTreeItems,
} = require('../out/providers/BookmarkTreeInteractionRunner')
restoreModules()

function fileNode(id, bookmarkPath) {
  return new Bookmark({
    id,
    path: bookmarkPath,
    scriptId: `script-${id}`,
    contextValue: ContextBookmark.File,
    collapsible: vscode.TreeItemCollapsibleState.Collapsed,
  })
}

function bookmark(id, label, bookmarkPath, line = 0, parent) {
  return new Bookmark({
    id,
    label,
    path: bookmarkPath,
    parent,
    ownerScriptId: parent?.scriptId,
    start: new CursorIndex(line, 0),
    end: new CursorIndex(line, 0),
  })
}

function addChild(parent, child) {
  child.parent = parent
  parent.subs.add(child)
  parent.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
}

async function main() {
  function memento() {
    const values = new Map()
    return { get: key => values.get(key), update: async (key, value) => { values.set(key, value) } }
  }
  const context = { workspaceState: memento(), globalState: memento() }
  const anotherWorkspace = { ...context, workspaceState: memento() }
  const workspaceScope = 'workspace:C:/workspace'
  const scriptScope = 'file:C:/standalone/a.ts'
  const otherScriptScope = 'file:C:/standalone/b.ts'
  let scope = workspaceScope
  const preference = () => bookmarkSortPreference(context, scope)
  assert.equal(preference().mode, SortModeBookmark.LineAsc)
  assert.equal(bookmarkSortPreference(context, 'global'), undefined)
  await anotherWorkspace.workspaceState.update(ExtensionStateKeys.bookmarkSortMode, 99)
  assert.equal(bookmarkSortPreference(anotherWorkspace, workspaceScope).mode, SortModeBookmark.LineAsc)
  let tree = new BookmarkSet()
  let workspaceOrder = null
  let expansionRoots = []
  let defaultExpandLevel = 2
  let searchedBookmarks = []
  const events = []
  const port = {
    bookmarks: () => tree,
    workspaceOrder: () => workspaceOrder,
    persistWorkspaceOrder: async order => {
      workspaceOrder = [...order]
      events.push(`persist:${order.join('|')}`)
    },
    absoluteBookmarkPath: bookmarkPath => `C:\\workspace\\${bookmarkPath.replace(/\//g, '\\')}`,
    absoluteToRelative: () => 'src/search.ts',
    bookmarksForPath: () => searchedBookmarks,
    captureUndoState: order => {
      events.push(order === undefined ? 'capture:tree' : `capture:${order.join('|')}`)
      return { captured: true }
    },
    commitUndoState: (_captured, action) => {
      events.push(`commit:${action}`)
      return true
    },
    commitTopology: async () => { events.push('topology') },
    sortPreference: preference,
    refreshDecoration: () => events.push('refresh'),
    fireTreeChanged: () => events.push('tree'),
    expansionRoots: () => expansionRoots,
    getChildren: target => target ? [...target.subs.values] : [...expansionRoots],
    defaultExpandLevel: () => defaultExpandLevel,
    treeViewAvailable: () => true,
    revealTreeItem: (target, options) => {
      events.push(`reveal:${target.id}:${String(options.expand)}:${String(options.select)}`)
      return Promise.resolve()
    },
    setExpandCollapseContext: async expanded => { events.push(`context:${expanded}`) },
  }

  const invalid = bookmark('invalid', 'Invalid', 'src/a.ts')
  invalid.contextValue = ContextBookmark.BookmarkInvalid
  const invalidTransfer = new DataTransfer()
  runBookmarkTreeDrag([invalid], invalidTransfer)
  assert.equal(invalidTransfer.get(BOOKMARK_TREE_MIME_TYPE), undefined)
  assert.equal(warningMessages.at(-1), '请编辑失效的书签')

  const fileA = fileNode('file-a', 'src/a.ts')
  const fileB = fileNode('file-b', 'src/b.ts')
  const fileC = fileNode('file-c', 'src/c.ts')
  tree.addAll([fileA, fileB, fileC])
  workspaceOrder = ['src/a.ts', 'src/b.ts', 'src/c.ts']
  const fileTransfer = new DataTransfer()
  runBookmarkTreeDrag([fileC], fileTransfer)
  assert.deepEqual(fileTransfer.get(BOOKMARK_TREE_MIME_TYPE).value, [fileC])
  await preference().save(SortModeBookmark.TimeAsc)
  await runBookmarkTreeDrop(fileA, fileTransfer, port)
  assert.equal(preference().mode, SortModeBookmark.Custom)
  assert.equal(informationMessages.at(-1), '检测到拖拽操作，已自动切换回“自定义排序”模式。')
  assert.deepEqual(tree.values.map(item => item.id), ['file-c', 'file-a', 'file-b'])
  assert.deepEqual(events, [
    'capture:tree',
    'commit:reorderFiles',
    'topology',
    'refresh',
  ])

  const mixed = bookmark('mixed', 'Mixed', 'src/a.ts', 0, fileA)
  addChild(fileA, mixed)
  const mixedTransfer = new DataTransfer()
  mixedTransfer.set(BOOKMARK_TREE_MIME_TYPE, new DataTransferItem([
    fileB,
    mixed,
  ]))
  events.length = 0
  await runBookmarkTreeDrop(undefined, mixedTransfer, port)
  assert.deepEqual(tree.values.slice(-2).map(item => item.id), ['file-b', 'mixed'])
  assert.equal(mixed.ownerScriptId, fileA.scriptId)
  assert.deepEqual(events, ['capture:tree', 'commit:moveBookmarks', 'topology', 'refresh'])

  tree = new BookmarkSet()
  const sourceFile = fileNode('source-file', 'src/source.ts')
  const first = bookmark('first', 'First', sourceFile.path, 1, sourceFile)
  const second = bookmark('second', 'Second', sourceFile.path, 2, sourceFile)
  addChild(sourceFile, first)
  addChild(sourceFile, second)
  tree.add(sourceFile)
  const bookmarkTransfer = new DataTransfer()
  runBookmarkTreeDrag([second], bookmarkTransfer)
  events.length = 0
  await runBookmarkTreeDrop(first, bookmarkTransfer, port)
  assert.deepEqual(sourceFile.subs.values.map(item => item.id), ['second', 'first'])
  assert.deepEqual(events, [
    'capture:tree',
    'commit:moveBookmarks',
    'topology',
    'refresh',
  ])

  const otherFile = fileNode('other-file', 'src/other.ts')
  const otherBookmark = bookmark('other', 'Other', otherFile.path, 0, otherFile)
  addChild(otherFile, otherBookmark)
  tree.add(otherFile)
  events.length = 0
  await runBookmarkTreeDrop(otherBookmark, bookmarkTransfer, port)
  assert.deepEqual(otherFile.subs.values.map(item => item.id), ['second', 'other'])
  assert.equal(second.ownerScriptId, sourceFile.scriptId)
  assert.deepEqual(events, ['capture:tree', 'commit:moveBookmarks', 'topology', 'refresh'])

  sourceFile.isPinned = true
  const nestedFileTransfer = new DataTransfer()
  runBookmarkTreeDrag([otherFile], nestedFileTransfer)
  events.length = 0
  await runBookmarkTreeDrop(sourceFile, nestedFileTransfer, port)
  assert.equal(otherFile.parent, sourceFile)
  assert.equal(otherFile.scriptId, 'script-other-file')
  assert.deepEqual(events.slice(0, 3), ['capture:tree', 'commit:moveBookmarks', 'topology'])

  const cyclicTransfer = new DataTransfer()
  runBookmarkTreeDrag([sourceFile], cyclicTransfer)
  await preference().save(SortModeBookmark.LineDesc)
  events.length = 0
  await runBookmarkTreeDrop(second, cyclicTransfer, port)
  assert.deepEqual(events, ['capture:tree'])
  assert.equal(warningMessages.at(-1), '不能把父书签移动到它的子书签之前。')
  assert.equal(preference().mode, SortModeBookmark.LineDesc)

  const marker = bookmark('marker', 'TODO', 'src/z.ts', 9)
  marker.codeMarker = {}
  marker.createdAt = 200
  const early = bookmark('early', 'Early', 'src/a.ts', 5)
  early.createdAt = 100
  const late = bookmark('late', 'Late', 'src/b.ts', 1)
  late.createdAt = 300
  const customItems = [late, marker, early]
  assert.equal(sortBookmarkTreeItems(customItems, SortModeBookmark.Custom), customItems)
  assert.deepEqual(sortBookmarkTreeItems(customItems, SortModeBookmark.TimeAsc).map(item => item.id), ['marker', 'early', 'late'])
  assert.deepEqual(sortBookmarkTreeItems(customItems).map(item => item.id), ['early', 'late', 'marker'])
  assert.deepEqual(sortBookmarkTreeItems(customItems, SortModeBookmark.LineDesc).map(item => item.id), ['marker', 'late', 'early'])
  const sameFile = [bookmark('middle', 'Middle', 'src/z.ts', 5), marker, bookmark('top', 'Top', 'src/z.ts', 1)]
  assert.deepEqual(sortBookmarkTreeItems(sameFile).map(item => item.id), ['top', 'middle', 'marker'])

  const expansionFile = fileNode('expand-file', 'src/expand.ts')
  const branch = bookmark('branch', 'Branch', expansionFile.path, 1, expansionFile)
  const leaf = bookmark('leaf', 'Leaf', expansionFile.path, 2, branch)
  addChild(branch, leaf)
  addChild(expansionFile, branch)
  expansionRoots = [expansionFile]
  defaultExpandLevel = 2
  events.length = 0
  await runToggleExpandCollapse(port)
  assert.equal(expansionFile.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
  assert.equal(branch.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
  assert.deepEqual(events, [
    'reveal:expand-file:true:false',
    'reveal:branch:true:false',
    'reveal:leaf:false:false',
    'context:true',
  ])

  events.length = 0
  commandCalls.length = 0
  await runToggleExpandCollapse(port)
  assert.deepEqual(commandCalls, [
    ['codebookmarkTreeView.focus'],
    ['list.collapseAll'],
  ])
  assert.deepEqual(events, ['context:false'])

  events.length = 0
  branch.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  await runExpandFolderTreeView(branch, port)
  assert.equal(branch.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
  assert.deepEqual(events, [
    'reveal:branch:true:true',
    'context:true',
  ])
  events.length = 0
  publishExpandCollapseContext(port)
  assert.deepEqual(events, ['context:true'])

  const searchBookmark = bookmark('search', 'Search target', 'src/search.ts', 6)
  searchBookmark.content = 'target content'
  searchedBookmarks = [searchBookmark]
  vscode.window.activeTextEditor = { document: { uri: { fsPath: 'C:\\workspace\\src\\search.ts' } } }
  quickPickSelector = items => items[0]
  quickPickCalls.length = 0
  commandCalls.length = 0
  await runSearchBookmarksInActiveFile(port)
  assert.equal(quickPickCalls[0].items[0].label, '$(bookmark) Search target')
  assert.equal(quickPickCalls[0].items[0].description, '第 7 行')
  assert.equal(quickPickCalls[0].items[0].detail, 'target content')
  assert.deepEqual(quickPickCalls[0].options, {
    placeHolder: '搜索当前文件的书签',
    matchOnDescription: true,
    matchOnDetail: true,
  })
  assert.equal(commandCalls[0][0], 'codebookmark.openBookmark')
  assert.equal(commandCalls[0][1], searchBookmark)

  vscode.window.activeTextEditor = undefined
  await runSearchBookmarksInActiveFile(port)
  assert.equal(warningMessages.at(-1), '当前没有打开的文件')

  scope = scriptScope
  quickPickSelector = items => {
    scope = otherScriptScope
    return items.find(item => item.mode === SortModeBookmark.TimeDesc)
  }
  quickPickCalls.length = 0
  events.length = 0
  await runSelectBookmarkSortMode(port)
  assert.equal(preference().mode, SortModeBookmark.LineAsc)
  assert.equal(bookmarkSortPreference(context, scriptScope).mode, SortModeBookmark.TimeDesc)
  assert.equal(bookmarkSortPreference(context, workspaceScope).mode, SortModeBookmark.LineDesc)
  assert.equal(bookmarkSortPreference(context, 'workspace:C:/workspace/second-root').mode, SortModeBookmark.LineDesc)
  assert.equal(bookmarkSortPreference(anotherWorkspace, workspaceScope).mode, SortModeBookmark.LineAsc)
  assert.equal(bookmarkSortPreference(anotherWorkspace, scriptScope).mode, SortModeBookmark.TimeDesc)
  assert.deepEqual(quickPickCalls[0].items.map(item => item.label), [
    '按位置升序',
    '按位置降序',
    '按时间升序',
    '按时间降序',
    '自定义排序',
  ])
  assert.equal(quickPickCalls[0].items[0].description, '（当前）')
  assert.equal(quickPickCalls[0].options.placeHolder, '选择排序方式')
  assert.deepEqual(events, ['tree'])

  scope = workspaceScope
  quickPickSelector = items => items.find(item => item.mode === SortModeBookmark.Custom)
  await runSelectBookmarkSortMode(port)
  assert.equal(preference().mode, SortModeBookmark.Custom)
  assert.equal(bookmarkSortPreference(context, scriptScope).mode, SortModeBookmark.TimeDesc)
}

main().then(
  () => console.log('BookmarkTreeInteractionRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
