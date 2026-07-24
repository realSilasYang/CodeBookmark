/**
 * 检查 BookmarkSet 到树视图节点的投影、排序和子节点读取不产生磁盘副作用。
 * 脚本直接调用编译后的 `BookmarkTreeDataProjection`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { BookmarkTreeDataProjection } = require('../out/providers/BookmarkTreeDataProjection')

function item(id, itemPath, isFile = false, children = []) {
  const value = { id, path: itemPath, isFile, children, parent: undefined, resourceUri: undefined, refreshes: 0 }
  for (const child of children) child.parent = value
  return value
}

function createHarness(rootItems = []) {
  const projection = new BookmarkTreeDataProjection()
  const state = {
    roots: rootItems,
    workspace: false,
    layoutActive: false,
    currentScopeFilePath: undefined,
    order: null,
    persisted: [],
    resolved: 0,
  }
  const allItems = () => {
    const result = []
    const visit = values => {
      for (const value of values) {
        result.push(value)
        visit(value.children)
      }
    }
    visit(state.roots)
    return result
  }
  const port = {
    rootItems: () => state.roots,
    findItem: candidate => allItems().find(current => current.id === candidate.id),
    childrenOf: candidate => candidate.children,
    parentOf: candidate => candidate.parent,
    isFile: candidate => candidate.isFile,
    itemPath: candidate => candidate.path,
    resourceUri: candidate => candidate.resourceUri,
    setResourceUri: (candidate, uri) => { candidate.resourceUri = uri },
    createResourceUri: absolutePath => `uri:${absolutePath}`,
    absoluteBookmarkPath: bookmarkPath => `C:/workspace/${bookmarkPath}`,
    relativeBookmarkPath: absolutePath => absolutePath.replace('C:/workspace/', ''),
    isWorkspaceScope: () => state.workspace,
    workspaceLayoutActive: () => state.layoutActive,
    currentScopeFilePath: () => state.currentScopeFilePath,
    workspaceOrder: () => state.order,
    setWorkspaceOrder: order => { state.order = [...order] },
    persistWorkspaceOrder: order => { state.persisted.push([...order]) },
    sortItems: items => [...items].reverse(),
    refreshItem: candidate => { candidate.refreshes++ },
    resolveTreePopulation: () => { state.resolved++ },
  }
  return { port, projection, state }
}

const firstBookmark = item('first', 'src/a.ts')
const secondBookmark = item('second', 'src/a.ts')
const firstFile = item('file-a', 'src/a.ts', true, [firstBookmark, secondBookmark])
const secondFile = item('file-b', 'src/b.ts', true, [item('third', 'src/b.ts')])

const standalone = createHarness([firstFile, secondFile])
assert.deepEqual(standalone.projection.standaloneRoots(standalone.port), [firstBookmark, secondBookmark])
assert.deepEqual(standalone.projection.children(undefined, standalone.port), [secondBookmark, firstBookmark])
assert.equal(standalone.projection.parent(firstBookmark, standalone.port), undefined)
standalone.state.currentScopeFilePath = 'C:/workspace/src/b.ts'
assert.deepEqual(standalone.projection.standaloneRoots(standalone.port), secondFile.children)
assert.deepEqual(standalone.projection.children({ id: 'file-a' }, standalone.port), [secondBookmark, firstBookmark])
assert.deepEqual(standalone.projection.children({ id: 'missing' }, standalone.port), [])

const workspace = createHarness([firstFile, secondFile])
workspace.state.workspace = true
workspace.state.order = ['src/b.ts', 'missing.ts', 'src/b.ts']
assert.deepEqual(workspace.projection.children(undefined, workspace.port), [firstFile, secondFile])
assert.deepEqual(workspace.state.order, ['src/b.ts', 'src/a.ts'])
assert.deepEqual(workspace.state.persisted, [['src/b.ts', 'src/a.ts']])
assert.equal(firstFile.resourceUri, 'uri:C:/workspace/src/a.ts')
assert.equal(workspace.projection.hasFileNode('src\\a.ts'), true)
assert.equal(workspace.projection.fileNode('src/b.ts'), secondFile)
assert.equal(workspace.projection.parent(firstBookmark, workspace.port), firstFile)

const nestedFile = item('nested-file', 'src/nested.ts', true, [item('nested-child', 'src/nested.ts')])
const visualContainer = item('visual-container', 'src/root.ts', false, [nestedFile])
const layoutRootFile = item('layout-root-file', 'src/root.ts', true, [visualContainer])
const layoutWorkspace = createHarness([layoutRootFile])
layoutWorkspace.state.workspace = true
layoutWorkspace.state.layoutActive = true
assert.deepEqual(layoutWorkspace.projection.children(undefined, layoutWorkspace.port), [layoutRootFile])
assert.deepEqual(layoutWorkspace.projection.children(visualContainer, layoutWorkspace.port), [nestedFile])
assert.equal(layoutWorkspace.projection.parent(nestedFile, layoutWorkspace.port), visualContainer)
assert.equal(layoutWorkspace.projection.fileNode('src/nested.ts'), nestedFile)
assert.equal(layoutWorkspace.state.order, null)
assert.deepEqual(layoutWorkspace.state.persisted, [])

workspace.projection.clearFileNodeCache()
assert.equal(workspace.projection.hasFileNode('src/a.ts'), false)
workspace.projection.rebuildFileNodeCache([firstBookmark, secondFile], workspace.port)
assert.equal(workspace.projection.fileNode('src/b.ts'), secondFile)

firstFile.resourceUri = undefined
assert.equal(workspace.projection.treeItem(firstFile, workspace.port), firstFile)
assert.equal(firstFile.resourceUri, 'uri:C:/workspace/src/a.ts')
assert.equal(firstFile.refreshes, 1)
assert.equal(workspace.state.resolved, 1)
workspace.projection.treeItem({ ...firstFile, id: 'detached', resourceUri: undefined }, workspace.port)
assert.equal(workspace.state.resolved, 1)

const empty = createHarness()
assert.deepEqual(empty.projection.children(undefined, empty.port), [])

const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
assert.match(provider, /return this\.bookmarkTreeDataProjection\.children\(element, this\.bookmarkTreeDataProjectionPort\(\)\)/)
assert.match(provider, /return this\.bookmarkTreeDataProjection\.treeItem\(element, this\.bookmarkTreeDataProjectionPort\(\)\)/)
assert.doesNotMatch(provider, /private fileNodesCache/)

console.log('BookmarkTreeDataProjection contract verified.')
