/**
 * 验证原生树条目标记跟随光标、滚动和折叠状态。
 * 标记仅影响呈现，节点选择、编辑和持久化继续使用原对象。
 */
const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')
const currentBookmarkSymbol = '🏲'

function event() {
  const listeners = new Set()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return { dispose: () => listeners.delete(listener) }
    },
    fire(value) {
      for (const listener of listeners) listener(value)
    },
  }
}

const activeEditorChanged = event()
const selectionChanged = event()
const visibleRangesChanged = event()
const treeChanged = event()
const collapsed = event()
const expanded = event()
const visibilityChanged = event()
const vscode = {
  Disposable: { from: (...subscriptions) => ({ dispose: () => subscriptions.forEach(subscription => subscription.dispose()) }) },
  TreeItemCollapsibleState: { Expanded: 2, Collapsed: 1 },
  window: {
    onDidChangeActiveTextEditor: activeEditorChanged.subscribe,
    onDidChangeTextEditorSelection: selectionChanged.subscribe,
    onDidChangeTextEditorVisibleRanges: visibleRangesChanged.subscribe,
  },
}
const restoreModules = installModuleMocks({ vscode })
const { CurrentBookmarkMarker } = require('../out/providers/CurrentBookmarkMarker')

function range(start, end) {
  return { start: { line: start }, contains: position => start <= position.line && position.line <= end }
}

function bookmark(id, line, parent, details = {}) {
  return { id, start: { line }, parent, treeDepth: parent ? parent.treeDepth + 1 : 0, ...details }
}

const parent = bookmark('parent', 4, undefined, { collapsibleState: 2 })
const child = bookmark('child', 8, parent, { label: 'Child', description: 'from sample.css', command: { command: 'open' } })
const invalid = bookmark('invalid', 11, parent, { isBookmarkInvalid: true })
const next = bookmark('next', 17)
const editor = {
  document: { uri: { scheme: 'file' } },
  selection: { active: { line: 3 } },
  visibleRanges: [range(0, 30)],
}
const updates = []
let candidates = [next, parent, invalid, child]
const marker = new CurrentBookmarkMarker(
  current => current === editor ? candidates : [],
  item => item.parent,
  affected => updates.push(affected.map(item => item.id)),
)
const subscription = marker.track({
  visible: true,
  onDidChangeVisibility: visibilityChanged.subscribe,
  onDidCollapseElement: collapsed.subscribe,
  onDidExpandElement: expanded.subscribe,
}, treeChanged.subscribe)

try {
  vscode.window.activeTextEditor = editor
  activeEditorChanged.fire(editor)
  assert.equal(updates.length, 0, 'before the first section there is no marker')

  editor.selection.active.line = 12
  selectionChanged.fire({ textEditor: editor })
  assert.deepEqual(updates.at(-1), ['child'])
  assert.equal(marker.decorate(child).description, `${currentBookmarkSymbol}  from sample.css`)
  assert.equal(marker.decorate(child).label, child.label)
  assert.equal(child.description, 'from sample.css')
  assert.equal(marker.decorate(child).resourceUri, child.resourceUri)
  assert.equal(marker.decorate(child).command, child.command)

  parent.collapsibleState = 1
  collapsed.fire({ element: parent })
  assert.deepEqual(updates.at(-1), ['child', 'parent'])
  assert.equal(marker.decorate(parent).description, currentBookmarkSymbol)
  assert.equal(marker.decorate(child), child)
  parent.collapsibleState = 2
  expanded.fire({ element: parent })
  assert.deepEqual(updates.at(-1), ['parent', 'child'])

  editor.visibleRanges = [range(19, 25)]
  visibleRangesChanged.fire({ textEditor: {} })
  assert.equal(marker.decorate(child).description, `${currentBookmarkSymbol}  from sample.css`)
  visibleRangesChanged.fire({ textEditor: editor })
  assert.deepEqual(updates.at(-1), ['child', 'next'])
  assert.equal(marker.decorate(next).description, currentBookmarkSymbol)
  assert.equal(marker.decorate(child), child)

  const updatedNext = { ...next }
  candidates = [updatedNext]
  const count = updates.length
  treeChanged.fire()
  assert.equal(updates.length, count, 'a full refresh already renders the replacement node')
  assert.equal(marker.decorate(updatedNext).description, currentBookmarkSymbol)
  assert.equal(marker.decorate(next), next)

  vscode.window.activeTextEditor = { document: { uri: { scheme: 'untitled' } } }
  activeEditorChanged.fire(vscode.window.activeTextEditor)
  assert.deepEqual(updates.at(-1), ['next'])
  assert.equal(marker.decorate(updatedNext), updatedNext)
} finally {
  subscription.dispose()
  restoreModules()
}
