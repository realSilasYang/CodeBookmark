/**
 * 覆盖 AI 结果到书签树的层级构建、追加与替换，并确认自动标记不会被用户书签操作覆盖。
 * 脚本直接调用编译后的 `Bookmark`、`AIBookmarkBuilder`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const { vscode } = createVscodeFake()
const restoreModules = installModuleMocks({ vscode })
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { buildAIBookmarks, expandGeneratedBookmarkTree } = require('../out/providers/AIBookmarkBuilder')
restoreModules()

const existing = new Bookmark({
  path: 'src/main.ts',
  label: '自动标记',
  start: new CursorIndex(1, 0),
  end: new CursorIndex(1, 1),
  codeMarker: { generatedLabel: 'TODO' },
})
const sourceLines = ['function start() {', '  // TODO', '  return true', '}']
const result = buildAIBookmarks([
  {
    label: '入口函数',
    line: 0,
    content: sourceLines[0],
    iconName: 'fun_rocket_fluent.svg',
    subs: [{ label: '返回阶段', line: 2, content: sourceLines[2], subs: [] }],
  },
  { label: '重复位置', line: 1, content: sourceLines[1], subs: [] },
], sourceLines, 'src/main.ts', [existing], true, true)

assert.equal(result.created, 2)
assert.equal(result.skipped, 1)
assert.equal(result.roots.length, 1)
assert.equal(result.roots[0].subs.size, 1)
assert.equal(result.roots[0].subs.values[0].parent, result.roots[0])
assert.equal(result.roots[0].icon, 'fun_rocket_fluent.svg')
assert.equal(result.roots[0].subs.values[0].icon, '')
assert.equal(result.roots[0].collapsibleState, 2)
assert.equal(result.roots[0].contextBefore, undefined)
assert.equal(result.roots[0].contextAfter, '// TODO')

const deepResult = buildAIBookmarks([{
  label: '一级', line: 0, content: sourceLines[0], subs: [{
    label: '二级', line: 1, content: sourceLines[1], subs: [{
      label: '三级', line: 2, content: sourceLines[2], subs: [],
    }],
  }],
}], sourceLines, 'src/deep.ts', [], false, false)
assert.equal(deepResult.roots[0].collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
assert.equal(deepResult.roots[0].subs.values[0].collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
assert.equal(deepResult.roots[0].subs.values[0].subs.values[0].collapsibleState, vscode.TreeItemCollapsibleState.None)

const fileContainer = new Bookmark({
  path: 'src/deep.ts',
  label: 'deep.ts',
  collapsible: vscode.TreeItemCollapsibleState.Collapsed,
  subs: new (require('../out/models/BookmarkSet').BookmarkSet)(),
})
const visualContainer = new Bookmark({
  path: 'src/other.ts',
  label: '跨文件容器',
  collapsible: vscode.TreeItemCollapsibleState.Collapsed,
  subs: new (require('../out/models/BookmarkSet').BookmarkSet)(),
  parent: fileContainer,
})
fileContainer.subs.add(visualContainer)
visualContainer.subs.add(deepResult.roots[0])
deepResult.roots[0].parent = visualContainer
expandGeneratedBookmarkTree(deepResult.roots)
assert.equal(fileContainer.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
assert.equal(visualContainer.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
assert.equal(deepResult.roots[0].collapsibleState, vscode.TreeItemCollapsibleState.Expanded)

const duplicateResult = buildAIBookmarks([
  { label: '占用行', line: 1, content: sourceLines[1], subs: [] },
], sourceLines, 'src/main.ts', [existing], false, false)
assert.equal(duplicateResult.created, 0)
assert.equal(duplicateResult.skipped, 1)

console.log('AIBookmarkBuilder contract verified.')
