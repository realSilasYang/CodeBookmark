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
