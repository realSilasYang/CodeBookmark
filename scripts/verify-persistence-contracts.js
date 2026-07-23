/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-persistence-contracts`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-persistence-contracts` 对应契约。
 * 核心边界：通过断言锁定“verify-persistence-contracts”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { installModuleMocks } = require('./test-support/module-mocks')
const { createVscodeFake } = require('./test-support/vscode-fake')

const { vscode } = createVscodeFake({
  workspace: {
    getConfiguration: section => ({
      get: key => section === 'codebookmark' && key === 'autoSpace' ? true : undefined,
    }),
  },
})
const restoreModules = installModuleMocks({ vscode })

try {
  const { Bookmark, BookmarkSet, CursorIndex } = (() => {
    const bookmarkModule = require('../out/models/Bookmark')
    return { ...bookmarkModule, BookmarkSet: require('../out/models/BookmarkSet').BookmarkSet }
  })()

  const child = new Bookmark({
    id: 'child-bookmark',
    createdAt: 1700000000001,
    label: 'Child marker',
    path: 'src/example.ts',
    content: '  // TODO: child  ',
    icon: 'status_idea_yellow.svg',
    start: new CursorIndex(5, 3),
    end: new CursorIndex(5, 7),
    codeMarker: {
      type: 'code-marker',
      marker: 'TODO',
      generatedLabel: 'TODO: child',
      iconCustomized: false,
    },
  })
  const root = new Bookmark({
    id: 'root-bookmark',
    createdAt: 1700000000000,
    label: 'Root bookmark',
    path: 'src/example.ts',
    content: '  function example() {}  ',
    contextBefore: '// before',
    contextAfter: '// after',
    icon: 'status_idea_red.svg',
    start: new CursorIndex(2, 1),
    end: new CursorIndex(4, 8),
    subs: new BookmarkSet([child]),
    isPinned: true,
  })
  child.parent = root

  const fixturePath = path.join(__dirname, 'fixtures', 'bookmark-tree-contract.json')
  const expected = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
  const serialized = JSON.parse(JSON.stringify(root.toJSON()))
  assert.deepEqual(serialized, expected)

  const restored = Bookmark.fromJSON(expected)
  assert.deepEqual(JSON.parse(JSON.stringify(restored.toJSON())), expected)
  assert.equal(restored.subs.values[0].parent, restored)
  assert.equal(restored.isPinned, true)
  assert.equal(restored.subs.values[0].isCodeMarker, true)

  const localization = require('../out/i18n/Localization')
  localization.initializeLocalization('en')
  assert.throws(() => Bookmark.fromJSON([]), /Invalid bookmark data/)
  assert.throws(() => Bookmark.fromJSON({ ...expected, params: '4,0,3,0' }), /position range/)
  assert.throws(() => Bookmark.fromJSON({ ...expected, codeMarker: { type: 'unknown' } }), /metadata/)
  localization.initializeLocalization('zh-cn')
  assert.throws(() => Bookmark.fromJSON([]), /书签数据无效/)
} finally {
  restoreModules()
}
