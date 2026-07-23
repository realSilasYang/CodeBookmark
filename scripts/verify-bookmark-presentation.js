/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-presentation`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-presentation` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-presentation”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
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
  const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
  const { BookmarkSet } = require('../out/models/BookmarkSet')
  const { ContextBookmark } = require('../out/util/ContextValue')
  const { initializeBookmarkIconRoot } = require('../out/util/BookmarkIcon')

  initializeBookmarkIconRoot({ scheme: 'file', fsPath: path.resolve('extension-root') })

  const root = new Bookmark({ id: 'root', label: 'Root', path: 'src/example.ts' })
  assert.equal(root.contextValue, ContextBookmark.Bookmark)
  assert.equal(root.iconPath.id, 'bookmark')

  const child = new Bookmark({
    id: 'child',
    label: 'Child',
    path: 'src/example.ts',
    start: new CursorIndex(2, 0),
    end: new CursorIndex(2, 3),
  })
  root.subs.add(child)
  child.parent = root
  root.refreshDisplayProps()
  assert.equal(root.iconPath.color.id, 'codebookmark.color.Lvl1Orange')
  const firstIcon = root.iconPath
  root.refreshDisplayProps()
  assert.equal(root.iconPath, firstIcon)
  const grandchild = new Bookmark({ id: 'grandchild', label: 'Grandchild', path: 'src/example.ts' })
  child.subs.add(grandchild)
  grandchild.parent = child
  child.refreshDisplayProps()
  assert.equal(child.iconPath.color.id, 'codebookmark.color.Lvl2Blue')

  const custom = new Bookmark({ id: 'custom', label: 'Custom', path: 'src/example.ts', icon: 'status_idea_red.svg' })
  assert.equal(
    custom.iconPath.light.fsPath,
    path.resolve('extension-root', 'resources', 'custom_icons', 'status_idea_red.svg'),
  )

  const invalid = new Bookmark({ id: 'invalid', label: 'Invalid', path: 'src/example.ts', isInvalid: true })
  assert.equal(invalid.contextValue, ContextBookmark.BookmarkInvalid)
  assert.equal(invalid.iconPath.id, 'warning')

  const file = new Bookmark({
    id: 'file',
    path: 'src/example.ts',
    contextValue: ContextBookmark.File,
    subs: new BookmarkSet([child]),
  })
  assert.equal(file.iconPath.id, 'file')
} finally {
  restoreModules()
}
