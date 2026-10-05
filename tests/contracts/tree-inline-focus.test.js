/**
 * 验证书签树行内按钮不依赖视图焦点，交给宿主按悬停状态显示，避免按钮只在鼠标按下时闪现。
 * 同时保护多选限制、右键菜单及编辑子菜单；跳转后的单条选择清理由导航流程验证。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { describe, it } = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const { ContextBookmark } = require(path.join(root, 'out', 'util', 'ContextValue'))
const treeMenu = manifest.contributes.menus['view/item/context']
const inlineMenu = treeMenu.filter(item => item.group.split('@')[0] === 'inline')
const contextMenu = treeMenu.filter(item => item.group.split('@')[0] !== 'inline')
const identity = item => item.command ?? item.submenu

function visibleItems(items, overrides = {}) {
  const state = {
    view: 'codebookmarkTreeView',
    viewItem: ContextBookmark.Bookmark,
    focusedView: 'codebookmarkTreeView',
    isWorkspaceTrusted: true,
    codebookmarkTreeView: 'codebookmarkTreeView',
    ...Object.fromEntries(Object.values(ContextBookmark).map(value => [value, value])),
    codebookmark: { hasMultipleSelection: false, aiAnalysisAvailable: true },
    ...overrides,
  }
  return items.filter(item => !item.when || vm.runInNewContext(item.when, state)).map(identity)
}

describe('bookmark tree inline hover', () => {
  it('keeps every node type available for native hover before and after an editor gains focus', () => {
    assert.deepEqual(inlineMenu.map(identity), [
      'codebookmark.pinView',
      'codebookmark.unpinView',
      'codebookmark.editSubmenu',
      'codebookmark.deleteBookmark',
    ])
    for (const viewItem of Object.values(ContextBookmark)) {
      const hovered = visibleItems(inlineMenu, { viewItem })
      assert.ok(hovered.includes('codebookmark.editSubmenu'), viewItem)
      // 松开鼠标后跳转编辑器，focusedView 会清空；不能据此撤下悬停按钮。
      for (const focusedView of ['', undefined, 'workbench.explorer.fileView']) {
        for (const listFocus of [true, false]) {
          assert.deepEqual(visibleItems(inlineMenu, { viewItem, focusedView, listFocus }), hovered, viewItem)
        }
      }
      assert.deepEqual(visibleItems(inlineMenu, { viewItem, view: 'workbench.explorer.fileView' }), [], viewItem)
    }
  })

  it('preserves pinning restrictions and edit/delete actions for multiple selected bookmarks', () => {
    for (const viewItem of [ContextBookmark.Bookmark, ContextBookmark.BookmarkPinned]) {
      const state = { viewItem, codebookmark: { hasMultipleSelection: true, aiAnalysisAvailable: true } }
      assert.deepEqual(visibleItems(inlineMenu, state), [
        'codebookmark.editSubmenu',
        'codebookmark.deleteBookmark',
      ])
      assert.deepEqual(visibleItems(inlineMenu, { ...state, focusedView: '' }), visibleItems(inlineMenu, state))
      const singleSelection = visibleItems(inlineMenu, { viewItem })
      assert.ok(singleSelection.includes(viewItem === ContextBookmark.Bookmark
        ? 'codebookmark.pinView' : 'codebookmark.unpinView'))
    }
  })

  it('keeps right-click and open edit-submenu commands available without tree focus', () => {
    const editMenu = manifest.contributes.menus['codebookmark.editSubmenu']
    for (const viewItem of Object.values(ContextBookmark)) {
      for (const items of [contextMenu, editMenu]) {
        assert.deepEqual(visibleItems(items, { viewItem, focusedView: '' }), visibleItems(items, { viewItem }), viewItem)
      }
    }
    assert.deepEqual(visibleItems(editMenu, { focusedView: '' }), [
      'codebookmark.editBookmark.editLabel',
      'codebookmark.editBookmark.changeIcon',
      'codebookmark.editBookmark.updatePosOnly',
      'codebookmark.editBookmark.updatePosAndRename',
    ])
    for (const command of manifest.contributes.commands) {
      assert.ok(!command.enablement?.includes('focusedView'), command.command)
    }
  })
})
