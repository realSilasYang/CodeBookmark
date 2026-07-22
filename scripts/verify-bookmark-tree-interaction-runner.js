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
const { SortModeBookmark } = require('../out/models/ViewMode')
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
    saveBookmarks: paths => events.push(`save:${paths.join('|')}`),
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
  SortModeBookmark.mode = SortModeBookmark.TimeAsc
  await runBookmarkTreeDrop(fileA, fileTransfer, port)
  assert.equal(SortModeBookmark.mode, SortModeBookmark.Custom)
  assert.equal(informationMessages.at(-1), '检测到拖拽操作，已自动切换回“自定义排序”模式。')
  assert.deepEqual(workspaceOrder, ['src/c.ts', 'src/a.ts', 'src/b.ts'])
  assert.deepEqual(events, [
    'capture:src/a.ts|src/b.ts|src/c.ts',
    'persist:src/c.ts|src/a.ts|src/b.ts',
    'commit:reorderFiles',
    'tree',
  ])

  const mixedTransfer = new DataTransfer()
  mixedTransfer.set(BOOKMARK_TREE_MIME_TYPE, new DataTransferItem([
    fileA,
    bookmark('mixed', 'Mixed', 'src/a.ts'),
  ]))
  events.length = 0
  await runBookmarkTreeDrop(undefined, mixedTransfer, port)
  assert.deepEqual(events, [])
  assert.equal(warningMessages.at(-1), '不能同时拖动文件节点和书签节点。')

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
    'save:C:\\workspace\\src\\source.ts',
    'reveal:first:true:true',
    'refresh',
  ])

  const otherFile = fileNode('other-file', 'src/other.ts')
  const otherBookmark = bookmark('other', 'Other', otherFile.path, 0, otherFile)
  addChild(otherFile, otherBookmark)
  tree.add(otherFile)
  events.length = 0
  await runBookmarkTreeDrop(otherBookmark, bookmarkTransfer, port)
  assert.deepEqual(events, [])
  assert.equal(warningMessages.at(-1), '暂不支持跨文件移动书签。')

  const marker = bookmark('marker', 'TODO', 'src/z.ts', 9)
  marker.codeMarker = {}
  marker.createdAt = 200
  const early = bookmark('early', 'Early', 'src/a.ts', 5)
  early.createdAt = 100
  const late = bookmark('late', 'Late', 'src/b.ts', 1)
  late.createdAt = 300
  const customItems = [late, marker, early]
  SortModeBookmark.mode = SortModeBookmark.Custom
  assert.equal(sortBookmarkTreeItems(customItems), customItems)
  SortModeBookmark.mode = SortModeBookmark.TimeAsc
  assert.deepEqual(sortBookmarkTreeItems(customItems).map(item => item.id), ['marker', 'early', 'late'])
  SortModeBookmark.mode = SortModeBookmark.LineAsc
  assert.deepEqual(sortBookmarkTreeItems([late, early]).map(item => item.id), ['early', 'late'])
  SortModeBookmark.mode = SortModeBookmark.LineDesc
  assert.deepEqual(sortBookmarkTreeItems([early, late]).map(item => item.id), ['late', 'early'])

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

  SortModeBookmark.mode = SortModeBookmark.Custom
  quickPickSelector = items => items.find(item => item.label === '按位置降序')
  quickPickCalls.length = 0
  events.length = 0
  await runSelectBookmarkSortMode(port)
  assert.equal(SortModeBookmark.mode, SortModeBookmark.LineDesc)
  assert.equal(quickPickCalls[0].items.length, 5)
  assert.equal(quickPickCalls[0].items[0].description, '（当前）')
  assert.equal(quickPickCalls[0].options.placeHolder, '选择视图排序方式（不影响底层拖拽原始顺序）')
  assert.deepEqual(events, ['tree'])

  SortModeBookmark.mode = SortModeBookmark.Custom
}

main().then(
  () => console.log('BookmarkTreeInteractionRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
