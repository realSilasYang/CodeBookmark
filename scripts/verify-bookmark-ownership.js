/**
 * 验证跨文件视觉嵌套不会改变普通书签已经绑定的脚本身份。
 * 同时核对按所有权投影后，各脚本配置只收到真正属于自己的书签内容。
 */
const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')
const { createVscodeFake } = require('./test-support/vscode-fake')

const restore = installModuleMocks({ vscode: createVscodeFake().vscode })
try {
  const { Bookmark } = require('../out/models/Bookmark')
  const { BookmarkSet } = require('../out/models/BookmarkSet')
  const { ContextBookmark } = require('../out/util/ContextValue')
  const {
    applyWorkspaceLayout,
    captureWorkspaceLayout,
    projectBookmarksByOwner,
  } = require('../out/models/BookmarkOwnership')

  const scriptA = '10000000-0000-9000-1000-000000000021'
  const scriptB = '10000000-0000-9000-1000-000000000022'
  const markAId = '20000000-0000-9000-1000-000000000021'
  const markBId = '20000000-0000-9000-1000-000000000022'
  const fileA = new Bookmark({
    id: `file_${scriptA}`, scriptId: scriptA, path: 'a.ts', contextValue: ContextBookmark.File,
  })
  const fileB = new Bookmark({
    id: `file_${scriptB}`, scriptId: scriptB, path: 'b.ts', contextValue: ContextBookmark.File,
  })
  const markA = new Bookmark({ id: markAId, path: 'a.ts', label: 'A', ownerScriptId: scriptA })
  const markB = new Bookmark({ id: markBId, path: 'b.ts', label: 'B', ownerScriptId: scriptB })
  markA.parent = fileA
  fileA.subs.add(markA)
  markB.parent = fileB
  fileB.subs.add(markB)
  const root = new BookmarkSet([fileA, fileB])

  markB.parent = fileA
  fileB.subs.fastDelete(markB)
  fileA.subs.add(markB)
  fileB.parent = markA
  root.fastDelete(fileB)
  markA.subs.add(fileB)
  fileA.collapsibleState = 1
  markA.collapsibleState = 2

  const projected = new Map(projectBookmarksByOwner(root).map(value => [value.scriptId, value]))
  assert.deepEqual(projected.get(scriptA).bookmarks.map(value => value.id), [markAId])
  assert.deepEqual(projected.get(scriptB).bookmarks.map(value => value.id), [markBId])
  assert.equal(projected.get(scriptA).bookmarks[0].subs.length, 0)
  assert.equal(projected.get(scriptB).bookmarks[0].subs.length, 0)

  const layout = captureWorkspaceLayout(root, [], fileB)
  assert.equal(layout.entries.find(entry => entry.node.kind === 'script' && entry.node.scriptId === scriptB).parent.bookmarkId, markAId)
  assert.deepEqual(layout.expansionStates, [
    { node: { kind: 'script', scriptId: scriptA }, expanded: false },
    { node: { kind: 'bookmark', scriptId: scriptA, bookmarkId: markAId }, expanded: true },
  ])

  const reloadedMarkA = new Bookmark({ id: markAId, path: 'a.ts', label: 'A' })
  const reloadedMarkB = new Bookmark({ id: markBId, path: 'b.ts', label: 'B' })
  const localA = new Bookmark({
    id: `file_${scriptA}`, scriptId: scriptA, path: 'a.ts', contextValue: ContextBookmark.File,
    subs: new BookmarkSet([reloadedMarkA]),
  })
  const localB = new Bookmark({
    id: `file_${scriptB}`, scriptId: scriptB, path: 'b.ts', contextValue: ContextBookmark.File,
    subs: new BookmarkSet([reloadedMarkB]),
  })
  reloadedMarkA.parent = localA
  reloadedMarkB.parent = localB
  const reloaded = new BookmarkSet([localA, localB])
  applyWorkspaceLayout(reloaded, layout)
  assert.equal(reloaded.findParentBookmark(localB).id, markAId)
  assert.equal(localB.isPinned, true)
  assert.equal(reloadedMarkB.ownerScriptId, scriptB)
  assert.equal(localA.collapsibleState, 1)
  assert.equal(reloadedMarkA.collapsibleState, 2)

  console.log('Bookmark ownership projection verified.')
} finally {
  restore()
}
