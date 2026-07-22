const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const { vscode } = createVscodeFake()
const restoreModules = installModuleMocks({ vscode })
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { buildAIBookmarks } = require('../out/providers/AIBookmarkBuilder')
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

const duplicateResult = buildAIBookmarks([
  { label: '占用行', line: 1, content: sourceLines[1], subs: [] },
], sourceLines, 'src/main.ts', [existing], false, false)
assert.equal(duplicateResult.created, 0)
assert.equal(duplicateResult.skipped, 1)

console.log('AIBookmarkBuilder contract verified.')
