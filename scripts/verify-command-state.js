const assert = require('node:assert/strict')
const fs = require('node:fs')

const { isTreeExpandedToLevel } = require('../out/util/TreeExpansionState')

const COLLAPSED = 1
const EXPANDED = 2
const node = (level, state, children = []) => ({
  level,
  collapsibleState: state,
  subs: { size: children.length, values: children },
})

const completeTree = [node(0, EXPANDED, [
  node(1, EXPANDED, [node(2, EXPANDED, [node(3, COLLAPSED, [node(4, COLLAPSED)])])]),
  node(1, EXPANDED, [node(2, EXPANDED, [node(3, COLLAPSED)])]),
])]
assert.equal(isTreeExpandedToLevel(completeTree, 3, EXPANDED), true)

const incompleteSibling = [node(0, EXPANDED, [
  node(1, EXPANDED, [node(2, EXPANDED, [node(3, COLLAPSED)])]),
  node(1, COLLAPSED, [node(2, COLLAPSED)]),
])]
assert.equal(isTreeExpandedToLevel(incompleteSibling, 3, EXPANDED), false)
assert.equal(isTreeExpandedToLevel(completeTree, 0, EXPANDED), false)
assert.equal(isTreeExpandedToLevel([node(0, EXPANDED)], 3, EXPANDED), false)

const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const commands = new Map(manifest.contributes.commands.map(command => [command.command, command]))
const aiAnalysisCommands = [
  'codebookmark.ai.generateAppend',
  'codebookmark.ai.generateOverwrite',
  'codebookmark.ai.generateSkip',
  'codebookmark.ai.optimize',
  'codebookmark.ai.optimizeDirect',
  'codebookmark.ai.optimizeFolderDirect',
  'codebookmark.ai.optimizeSelectedDirect',
  'codebookmark.ai.optimizeSelected',
  'codebookmark.ai.generateAppendFolder',
  'codebookmark.ai.generateOverwriteFolder',
  'codebookmark.ai.generateAppendFolderDirect',
  'codebookmark.ai.generateOverwriteFolderDirect',
  'codebookmark.ai.generateSkipFolder',
  'codebookmark.ai.generateSkipFolderDirect',
  'codebookmark.ai.optimizeFolder',
  'codebookmark.ai.optimizeContextItem',
]
for (const command of aiAnalysisCommands) {
  assert.equal(commands.get(command)?.enablement, 'codebookmark.aiAnalysisAvailable')
}

const viewTitle = manifest.contributes.menus['view/title']
const activeAI = viewTitle.find(item => item.submenu === 'codebookmark.aiSubmenu')
const unavailableAI = viewTitle.find(item => item.command === 'codebookmark.ai.unavailable')
assert.equal(activeAI.when, '(view == codebookmarkTreeView)')
assert.equal(unavailableAI, undefined)
assert.equal(commands.has('codebookmark.ai.unavailable'), false)
assert.equal(commands.get('codebookmark.importBookmarkConfig')?.enablement, '!codebookmark.activeFileHasBookmark')
assert.equal(manifest.contributes.menus.commandPalette.some(item =>
  item.command === 'codebookmark.ai.optimizeDirect' && item.when === 'false'), true)
assert.equal(manifest.contributes.menus.commandPalette.some(item =>
  item.command === 'codebookmark.ai.optimizeFolderDirect' && item.when === 'false'), true)
assert.equal(manifest.contributes.menus.commandPalette.some(item =>
  item.command === 'codebookmark.ai.optimizeSelectedDirect' && item.when === 'false'), true)
assert.equal(manifest.contributes.menus.commandPalette.some(item =>
  item.command === 'codebookmark.ai.testConnection' && item.when === 'false'), true)
assert.equal(manifest.contributes.menus['codebookmark.aiSubmenu'].some(item =>
  item.command === 'codebookmark.ai.testConnection'), false)
assert.equal(manifest.contributes.menus.commandPalette.every(item => item.when === 'false'), true)
assert.equal(manifest.contributes.menus.commandPalette.some(item => item.command === 'codebookmark.undo.deleteBookmarks'), true)
assert.equal(manifest.contributes.menus.commandPalette.some(item => item.command === 'codebookmark.redo.deleteBookmarks'), true)

const undoDelete = commands.get('codebookmark.undo.deleteBookmarks')
const redoDelete = commands.get('codebookmark.redo.deleteBookmarks')
assert.equal(undoDelete?.title, '撤销：删除书签')
assert.equal(redoDelete?.title, '重做：删除书签')
assert.equal(viewTitle.some(item => item.command === undoDelete.command
  && item.when.includes('bookmarks.var.bookmark.undoOperation == deleteBookmarks')), true)
assert.equal(viewTitle.some(item => item.command === redoDelete.command
  && item.when.includes('bookmarks.var.bookmark.redoOperation == deleteBookmarks')), true)

const contextCoordinator = fs.readFileSync('src/providers/BookmarkContextCoordinator.ts', 'utf8')
const viewFactory = fs.readFileSync('src/providers/createCodeBookmarkView.ts', 'utf8')
const treeInteractionRunner = fs.readFileSync('src/providers/BookmarkTreeInteractionRunner.ts', 'utf8')
assert.match(contextCoordinator, /Commands\.varAIAnalysisAvailable, aiAnalysisAvailable/)
assert.match(contextCoordinator, /Commands\.varActiveFileAvailable, activeFileAvailable/)
assert.match(treeInteractionRunner, /isTreeExpandedToLevel\(/)
assert.ok((viewFactory.match(/provider\.refreshExpandCollapseContext\(\)/g) || []).length >= 2)
