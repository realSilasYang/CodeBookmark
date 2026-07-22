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
