const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')
const { createVscodeFake } = require('./test-support/vscode-fake')

const { vscode } = createVscodeFake()
const restoreModules = installModuleMocks({ vscode })
const { Bookmark } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { ContextBookmark } = require('../out/util/ContextValue')
const { reloadExternalBookmarkFiles } = require('../out/providers/ExternalBookmarkReloadRunner')

function fileBookmark(id, scriptId, scriptPath, subs = new BookmarkSet()) {
  return new Bookmark({ id, scriptId, contextValue: ContextBookmark.File, path: scriptPath, subs })
}

function regularBookmark(id, label, scriptPath, isPinned = false) {
  return new Bookmark({ id, label, path: scriptPath, isPinned })
}

function createHarness(overrides = {}) {
  const events = []
  let current = overrides.current ?? true
  const bookmarks = overrides.bookmarks
  const port = {
    enqueue: async (generation, operation) => {
      events.push(`enqueue:${generation}`)
      if (overrides.skipQueue) return undefined
      return operation()
    },
    readBookmarks: async (activePaths, filenames, signal) => {
      events.push(`read:${activePaths.join(',')}:${filenames.join(',')}:${signal === overrides.signal}`)
      return overrides.loaded ?? []
    },
    isCurrent: (scope, generation) => {
      events.push(`current:${scope}:${generation}`)
      return current
    },
    currentBookmarks: () => bookmarks,
    clearExternalBookmarkCaches: () => events.push('clearCaches'),
    publishTransition: async (transition, generation) => {
      events.push(`publish:${transition.previousHasContent}:${transition.nextHasContent}:${generation}`)
    },
    refreshDecorations: () => events.push('refresh'),
  }
  return { events, port, setCurrent: value => { current = value } }
}

async function main() {
  const pinned = regularBookmark('pinned-id', 'Pinned', 'src/main.ts', true)
  const current = new BookmarkSet([fileBookmark('old-file', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'src/main.ts', new BookmarkSet([pinned]))])
  const loadedFile = fileBookmark('new-file', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'src/main.ts', new BookmarkSet([
    regularBookmark('pinned-id', 'Loaded pinned', 'src/main.ts'),
    regularBookmark('new-child', 'New child', 'src/main.ts'),
  ]))
  const addedFile = fileBookmark('added-file', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'src/other.ts')
  const signal = new AbortController().signal
  const harness = createHarness({ bookmarks: current, loaded: [loadedFile, addedFile], signal })
  await reloadExternalBookmarkFiles(
    ['nested/AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA.JSON', 'same.json', 'nested/AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA.JSON'],
    'workspace:one',
    'C:/workspace/main.ts',
    8,
    signal,
    harness.port,
  )
  assert.deepEqual(harness.events, [
    'enqueue:8',
    'read:C:/workspace/main.ts:AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA.JSON,same.json:true',
    'current:workspace:one:8',
    'clearCaches',
    'publish:true:true:8',
    'current:workspace:one:8',
    'refresh',
  ])
  assert.equal(current.values.length, 2)
  const merged = current.values.find(bookmark => bookmark.scriptId === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  assert.equal(merged.subs.values.find(bookmark => bookmark.id === 'pinned-id').isPinned, true)
  assert.equal(current.values.some(bookmark => bookmark.scriptId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), true)

  const staleHarness = createHarness({ bookmarks: new BookmarkSet([addedFile]), loaded: [loadedFile] })
  staleHarness.setCurrent(false)
  await reloadExternalBookmarkFiles(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json'], 'workspace:one', undefined, 9, undefined, staleHarness.port)
  assert.deepEqual(staleHarness.events, ['enqueue:9', 'read::aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json:true', 'current:workspace:one:9'])
  assert.equal(staleHarness.events.includes('clearCaches'), false)

  const emptyHarness = createHarness({ bookmarks: new BookmarkSet() })
  await reloadExternalBookmarkFiles(['notes.txt'], 'workspace:one', undefined, 10, undefined, emptyHarness.port)
  assert.deepEqual(emptyHarness.events, [])

  restoreModules()
  console.log('ExternalBookmarkReloadRunner contract verified.')
}

main().catch(error => {
  restoreModules()
  console.error(error)
  process.exitCode = 1
})
