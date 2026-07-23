/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-standalone-tree`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-standalone-tree` 对应契约。
 * 核心边界：通过断言锁定“verify-standalone-tree”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const projection = fs.readFileSync('src/providers/BookmarkTreeDataProjection.ts', 'utf8')
const treeViewLifecycle = fs.readFileSync('src/providers/BookmarkTreeViewLifecycle.ts', 'utf8')

const section = (startMarker, endMarker) => {
  const start = provider.indexOf(startMarker)
  const end = provider.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0 && end > start, `无法截取：${startMarker}`)
  return provider.slice(start, end)
}

const getParent = section('getParent(element: Bookmark)', 'getChildren(element?: Bookmark)')
assert.match(getParent, /bookmarkTreeDataProjection\.parent\(element, this\.bookmarkTreeDataProjectionPort\(\)\)/)

const standaloneRoots = section('private standaloneRootBookmarks()', 'getChildren(element?: Bookmark)')
assert.match(standaloneRoots, /bookmarkTreeDataProjection\.standaloneRoots\(this\.bookmarkTreeDataProjectionPort\(\)\)/)

const getChildren = section('private _getChildrenInternal(', 'getTreeItem(')
assert.match(getChildren, /bookmarkTreeDataProjection\.children\(element, this\.bookmarkTreeDataProjectionPort\(\)\)/)
assert.match(projection, /if \(!port\.isWorkspaceScope\(\) && parent && port\.isFile\(parent\)\) return undefined/)
assert.match(projection, /const currentPathKey = bookmarkPathKey\(port\.relativeBookmarkPath\(currentScopeFilePath\)\)/)
assert.match(projection, /if \(!port\.isWorkspaceScope\(\)\) return port\.sortItems\(this\.standaloneRoots\(port\)\)/)

const expansion = section('private bookmarkTreeInteractionPort()', 'async forceAddBookmark(')
assert.match(expansion, /expansionRoots: \(\) => this\.currentStorageScope\?\.startsWith\('workspace:'\)[\s\S]*?: this\.standaloneRootBookmarks\(\)/)

const reveal = section('private scheduleActiveFileReveal(', 'public async ensureEditorScope(')
assert.match(reveal, /bookmarkTreeViewLifecycle\.scheduleActiveFileReveal\(/)
assert.match(treeViewLifecycle, /if \(!port\.isWorkspaceScope\(\)\) return/)
