const assert = require('node:assert/strict')
const path = require('node:path')
const {
  isSameOrDescendantAbsolutePath,
} = require('../out/util/AbsolutePath')
const {
  isSameOrDescendantBookmarkPath,
  renamedBookmarkPath,
} = require('../out/util/BookmarkPath')
const {
  applyRepositoryRelocations,
  runDeletedSourcePath,
  runRenamedSourcePath,
} = require('../out/providers/SourcePathChangeWorkflowRunner')

const workspaceA = path.resolve('C:\\workspace-a')
const workspaceB = path.resolve('C:\\workspace-b')
const scopeA = `workspace:${workspaceA}`
const scopeB = `workspace:${workspaceB}`

function scopeForPath(absolutePath) {
  if (isSameOrDescendantAbsolutePath(absolutePath, workspaceA)) return scopeA
  if (isSameOrDescendantAbsolutePath(absolutePath, workspaceB)) return scopeB
  return `file:${path.resolve(absolutePath)}`
}

function relativePath(absolutePath) {
  if (isSameOrDescendantAbsolutePath(absolutePath, workspaceA)) {
    return path.relative(workspaceA, absolutePath).replace(/\\/g, '/')
  }
  if (isSameOrDescendantAbsolutePath(absolutePath, workspaceB)) {
    return path.relative(workspaceB, absolutePath).replace(/\\/g, '/')
  }
  return path.resolve(absolutePath)
}

function createTree(fileNodes, events) {
  const tree = {
    values: fileNodes,
    containsPath: bookmarkPath => tree.values.some(node => isSameOrDescendantBookmarkPath(node.path, bookmarkPath)),
    renamePath: (oldBookmarkPath, newBookmarkPath) => {
      events.push(`tree:rename:${oldBookmarkPath}:${newBookmarkPath}`)
      for (const node of tree.values) {
        if (isSameOrDescendantBookmarkPath(node.path, oldBookmarkPath)) {
          node.path = renamedBookmarkPath(node.path, oldBookmarkPath, newBookmarkPath)
        }
      }
    },
    mergeDuplicateFileNodes: preferredIds => {
      events.push(`tree:merge:${preferredIds ? [...preferredIds].sort().join(',') : 'all'}`)
    },
    deleteWithPath: bookmarkPath => {
      events.push(`tree:delete:${bookmarkPath}`)
      const previousLength = tree.values.length
      tree.values = tree.values.filter(node => !isSameOrDescendantBookmarkPath(node.path, bookmarkPath))
      return tree.values.length !== previousLength
    },
  }
  return tree
}

function createHarness(options = {}) {
  const events = []
  let currentStorageScope = options.currentStorageScope
  let currentScopeFilePath = options.currentScopeFilePath
  let workspaceOrder = options.workspaceOrder ?? null
  const tree = createTree(options.fileNodes ?? [], events)
  const absoluteBookmarkPath = bookmarkPath => path.isAbsolute(bookmarkPath)
    ? path.resolve(bookmarkPath)
    : path.resolve(workspaceA, bookmarkPath)
  const port = {
    isDisposed: () => options.disposed ?? false,
    bookmarks: () => tree,
    currentStorageScope: () => currentStorageScope,
    setCurrentStorageScope: scope => {
      currentStorageScope = scope
      events.push(`scope:set:${scope}`)
    },
    currentScopeFilePath: () => currentScopeFilePath,
    setCurrentScopeFilePath: filePath => {
      currentScopeFilePath = filePath
      events.push(`scopePath:set:${filePath}`)
    },
    workspaceOrder: () => workspaceOrder,
    setWorkspaceOrder: order => {
      workspaceOrder = order
      events.push(`order:set:${order.join(',')}`)
    },
    absoluteToRelative: relativePath,
    absoluteBookmarkPath,
    storageScopeForAbsolutePath: scopeForPath,
    cancelPendingPathWork: absolutePath => { events.push(`cancel:${path.resolve(absolutePath)}`) },
    relocateUndoPath: (oldScope, newScope, oldBookmarkPath, newBookmarkPath) => {
      events.push(`undo:${oldScope}:${newScope}:${oldBookmarkPath}:${newBookmarkPath}`)
    },
    saveBookmarks: filePaths => { events.push(`save:${filePaths.map(filePath => path.resolve(filePath)).join(',')}`) },
    refreshDecoration: () => { events.push('refreshDecoration') },
    refresh: async storageScope => { events.push(`refresh:${storageScope}`) },
    reloadActiveTab: async forceReloadDisk => { events.push(`reload:${forceReloadDisk}`) },
    invalidatePathIndex: () => { events.push('index:invalidate') },
    clearFileNodeCache: () => { events.push('fileCache:clear') },
    fireTreeChanged: () => { events.push('tree:fire') },
    sourceFilesChanged: () => { events.push('sources:changed') },
  }
  return {
    events,
    port,
    tree,
    currentStorageScope: () => currentStorageScope,
    currentScopeFilePath: () => currentScopeFilePath,
    workspaceOrder: () => workspaceOrder,
  }
}

async function main() {
  const oldDirectory = path.join(workspaceA, 'src', 'old')
  const newDirectory = path.join(workspaceA, 'src', 'new')
  const sameScope = createHarness({
    currentStorageScope: scopeA,
    currentScopeFilePath: path.join(workspaceA, 'src', 'active.ts'),
    workspaceOrder: ['src/old/a.ts', 'src/other.ts'],
    fileNodes: [{ isFile: true, path: 'src/old/a.ts', scriptId: 'script-a' }],
  })
  await runRenamedSourcePath(oldDirectory, newDirectory, sameScope.port)
  assert.deepEqual(sameScope.workspaceOrder(), ['src/new/a.ts', 'src/other.ts'])
  assert.equal(sameScope.tree.values[0].path, 'src/new/a.ts')
  assert.deepEqual(sameScope.events, [
    `cancel:${path.resolve(oldDirectory)}`,
    'order:set:src/new/a.ts,src/other.ts',
    `undo:${scopeA}:${scopeA}:src/old:src/new`,
    'tree:rename:src/old:src/new',
    'tree:merge:script-a',
    `save:${path.resolve(newDirectory)}`,
    'refreshDecoration',
  ])

  const standaloneOld = path.resolve('C:\\scripts\\old.ts')
  const standaloneNew = path.resolve('C:\\scripts\\new.ts')
  const standalone = createHarness({
    currentStorageScope: scopeForPath(standaloneOld),
    currentScopeFilePath: standaloneOld,
    fileNodes: [{ isFile: true, path: standaloneOld, scriptId: 'standalone-id' }],
  })
  await runRenamedSourcePath(standaloneOld, standaloneNew, standalone.port)
  assert.equal(standalone.currentStorageScope(), scopeForPath(standaloneNew))
  assert.equal(standalone.currentScopeFilePath(), standaloneNew)
  assert.ok(standalone.events.includes(`scopePath:set:${standaloneNew}`))
  assert.ok(standalone.events.includes(`scope:set:${scopeForPath(standaloneNew)}`))
  assert.ok(standalone.events.includes(`save:${standaloneNew}`))
  assert.equal(standalone.events.some(event => event.startsWith('refresh:')), false)

  const standaloneIntoWorkspace = createHarness({
    currentStorageScope: scopeForPath(standaloneOld),
    currentScopeFilePath: standaloneOld,
    fileNodes: [{ isFile: true, path: standaloneOld, scriptId: 'moving-id' }],
  })
  const movedIntoWorkspace = path.join(workspaceA, 'src', 'moved.ts')
  await runRenamedSourcePath(standaloneOld, movedIntoWorkspace, standaloneIntoWorkspace.port)
  assert.equal(standaloneIntoWorkspace.currentScopeFilePath(), movedIntoWorkspace)
  assert.equal(standaloneIntoWorkspace.events.at(-1), `refresh:${scopeA}`)
  assert.equal(standaloneIntoWorkspace.events.some(event => event.startsWith('tree:rename:')), false)

  const incoming = createHarness({
    currentStorageScope: scopeA,
    currentScopeFilePath: path.join(workspaceA, 'src', 'active.ts'),
    workspaceOrder: [],
  })
  const incomingOld = path.join(workspaceB, 'src', 'incoming.ts')
  const incomingNew = path.join(workspaceA, 'src', 'incoming.ts')
  await runRenamedSourcePath(incomingOld, incomingNew, incoming.port)
  assert.deepEqual(incoming.workspaceOrder(), ['src/incoming.ts'])
  assert.equal(incoming.events.at(-1), 'reload:true')

  const outgoing = createHarness({
    currentStorageScope: scopeA,
    currentScopeFilePath: path.join(workspaceA, 'src', 'active.ts'),
    workspaceOrder: ['src/outgoing.ts', 'src/active.ts'],
    fileNodes: [{ isFile: true, path: 'src/outgoing.ts', scriptId: 'outgoing-id' }],
  })
  const outgoingOld = path.join(workspaceA, 'src', 'outgoing.ts')
  const outgoingNew = path.join(workspaceB, 'src', 'outgoing.ts')
  await runRenamedSourcePath(outgoingOld, outgoingNew, outgoing.port)
  assert.deepEqual(outgoing.workspaceOrder(), ['src/active.ts'])
  assert.deepEqual(outgoing.tree.values, [])
  assert.equal(outgoing.events.at(-1), 'refreshDecoration')

  const repository = createHarness({
    currentStorageScope: scopeA,
    currentScopeFilePath: path.join(workspaceA, 'src', 'active.ts'),
    workspaceOrder: ['src/old/a.ts'],
    fileNodes: [{ isFile: true, path: 'src/old/a.ts', scriptId: 'repository-id' }],
  })
  await applyRepositoryRelocations([{
    scriptId: 'repository-id',
    oldAbsolutePath: path.join(oldDirectory, 'a.ts'),
    newAbsolutePath: path.join(newDirectory, 'a.ts'),
  }], repository.port)
  assert.equal(repository.tree.values[0].path, 'src/new/a.ts')
  assert.deepEqual(repository.events.slice(-6), [
    'tree:merge:all',
    'index:invalidate',
    'fileCache:clear',
    'refreshDecoration',
    'tree:fire',
    'sources:changed',
  ])

  const repositoryCrossScope = createHarness({
    currentStorageScope: scopeA,
    currentScopeFilePath: path.join(oldDirectory, 'active.ts'),
    workspaceOrder: ['src/old/active.ts'],
  })
  await applyRepositoryRelocations([{
    scriptId: 'cross-id',
    oldAbsolutePath: path.join(oldDirectory, 'active.ts'),
    newAbsolutePath: path.join(workspaceB, 'src', 'active.ts'),
  }], repositoryCrossScope.port)
  assert.equal(repositoryCrossScope.events.at(-1), `refresh:${scopeB}`)
  assert.equal(repositoryCrossScope.events.includes('sources:changed'), false)

  const deleted = createHarness({
    currentStorageScope: scopeA,
    currentScopeFilePath: path.join(workspaceA, 'src', 'active.ts'),
    fileNodes: [{ isFile: true, path: 'src/deleted.ts', scriptId: 'deleted-id' }],
  })
  runDeletedSourcePath(path.join(workspaceA, 'src', 'deleted.ts'), deleted.port)
  assert.deepEqual(deleted.tree.values, [])
  assert.equal(deleted.events.at(-1), 'refreshDecoration')

  const unrelated = createHarness({
    currentStorageScope: scopeA,
    currentScopeFilePath: path.join(workspaceA, 'src', 'active.ts'),
    fileNodes: [{ isFile: true, path: 'src/kept.ts', scriptId: 'kept-id' }],
  })
  const unrelatedPath = path.resolve('C:\\outside\\unrelated.ts')
  runDeletedSourcePath(unrelatedPath, unrelated.port)
  assert.deepEqual(unrelated.events, [`cancel:${unrelatedPath}`])
  assert.equal(unrelated.tree.values.length, 1)

  const disposed = createHarness({ disposed: true, currentStorageScope: scopeA })
  await applyRepositoryRelocations([{
    scriptId: 'ignored',
    oldAbsolutePath: oldDirectory,
    newAbsolutePath: newDirectory,
  }], disposed.port)
  assert.deepEqual(disposed.events, [])
}

main().then(
  () => console.log('SourcePathChangeWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
