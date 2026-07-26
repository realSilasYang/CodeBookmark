/**
 * 核对命令、菜单 when 条件与上下文键的对应关系，确保不同视图状态不会出现无效入口。
 * 脚本直接调用编译后的 `TreeExpansionState`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const { isTreeExpandedToLevel } = require('../out/util/TreeExpansionState')

const COLLAPSED = 1
const EXPANDED = 2
const node = (level, state, children = []) => ({
  treeDepth: level,
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
const englishManifest = loadLocalizedManifest('en')
const commands = new Map(manifest.contributes.commands.map(command => [command.command, command]))
const englishCommands = new Map(englishManifest.contributes.commands.map(command => [command.command, command]))
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
  assert.equal(
    commands.get(command)?.enablement,
    '(codebookmark.aiAnalysisAvailable && isWorkspaceTrusted)',
  )
}

const viewTitle = manifest.contributes.menus['view/title']
const activeAI = viewTitle.find(item => item.submenu === 'codebookmark.aiSubmenu')
const unavailableAI = viewTitle.find(item => item.command === 'codebookmark.ai.unavailable')
assert.equal(activeAI.when, '(view == codebookmarkTreeView)')
assert.equal(unavailableAI, undefined)
assert.equal(commands.has('codebookmark.ai.unavailable'), false)
assert.equal(commands.get('codebookmark.importPortablePackage')?.enablement, undefined)
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

const treeItemMenu = manifest.contributes.menus['view/item/context']
const pinContainer = treeItemMenu.find(item => item.command === 'codebookmark.pinView')
const unpinContainer = treeItemMenu.find(item => item.command === 'codebookmark.unpinView')
assert.equal(commands.get('codebookmark.pinView')?.title, '设置为书签容器')
assert.equal(commands.get('codebookmark.unpinView')?.title, '取消作为书签容器')
assert.equal(englishCommands.get('codebookmark.pinView')?.title, 'Set as Bookmark Container')
assert.equal(englishCommands.get('codebookmark.unpinView')?.title, 'Stop Using as Bookmark Container')
assert.match(pinContainer?.when ?? '', /!codebookmark\.hasMultipleSelection/)
assert.match(unpinContainer?.when ?? '', /!codebookmark\.hasMultipleSelection/)

const contextCoordinator = fs.readFileSync('src/providers/BookmarkContextCoordinator.ts', 'utf8')
const viewFactory = fs.readFileSync('src/providers/createCodeBookmarkView.ts', 'utf8')
const treeInteractionRunner = fs.readFileSync('src/providers/BookmarkTreeInteractionRunner.ts', 'utf8')
const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
assert.match(contextCoordinator, /Commands\.varAIAnalysisAvailable, aiAnalysisAvailable/)
assert.match(contextCoordinator, /Commands\.varActiveFileAvailable, activeFileAvailable/)
assert.match(treeInteractionRunner, /isTreeExpandedToLevel\(/)
assert.match(provider, /Commands\.varHasMultipleSelection, selectedBookmarkCount > 1/)
assert.ok((viewFactory.match(/provider\.refreshExpandCollapseContext\(\)/g) || []).length >= 2)
