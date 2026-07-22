const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

class Position {
  constructor(line, character) {
    this.line = line
    this.character = character
  }

  isEqual(other) {
    return this.line === other.line && this.character === other.character
  }
}

class Range {
  constructor(start, end) {
    this.start = start
    this.end = end
  }
}

class Selection extends Range {
  constructor(start, end) {
    super(start, end)
    this.active = end
  }
}

const inputOptions = []
const inputResults = []
const informationMessages = []
const warningMessages = []
const { vscode } = createVscodeFake({
  Position,
  Range,
  Selection,
  window: {
    showInputBox: async options => {
      inputOptions.push(options)
      return inputResults.shift()
    },
    showInformationMessage: message => { informationMessages.push(message) },
    showWarningMessage: message => { warningMessages.push(message) },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const {
  runForceAddBookmark,
  runForceDeleteBookmark,
  runToggleBookmark,
} = require('../out/providers/ManualBookmarkWorkflowRunner')
restoreModules()

function selection(line, startCharacter = 0, endCharacter = startCharacter) {
  return new Selection(
    new Position(line, startCharacter),
    new Position(line, endCharacter),
  )
}

async function main() {
  const sourceLines = ['alpha()', 'beta()', '// TODO', 'delta()']
  const document = {
    uri: { fsPath: 'C:\\workspace\\source.ts' },
    lineAt: line => ({ text: sourceLines[line] }),
    getText: range => {
      if (!range) return sourceLines.join('\n')
      if (range.start.line !== range.end.line) return ''
      return sourceLines[range.start.line].slice(range.start.character, range.end.character)
    },
  }
  const editor = {
    document,
    selections: [selection(0), selection(0, 1, 1), selection(1, 0, 4)],
  }
  const bookmarks = []
  const protectedIds = new Set()
  const events = []
  let returnPinnedContainer = true
  let contextUpdates = 0
  const pinnedContainer = { id: 'pinned' }
  const port = {
    absoluteToRelative: () => 'source.ts',
    updateBookmarkContextAnchors: () => { contextUpdates++ },
    bookmarksForPath: () => bookmarks,
    findBookmarkById: id => bookmarks.find(bookmark => bookmark.id === id),
    bookmarkContainsCodeMarker: bookmark => protectedIds.has(bookmark.id),
    warnProtectedCodeMarkers: count => events.push(`warn:${count}`),
    deleteBookmark: id => {
      events.push(`delete:${id}`)
      const index = bookmarks.findIndex(bookmark => bookmark.id === id)
      if (index < 0) return false
      bookmarks.splice(index, 1)
      return true
    },
    addBookmark: bookmark => {
      events.push(`add:${bookmark.start.line}`)
      bookmarks.push(bookmark)
      if (returnPinnedContainer) {
        returnPinnedContainer = false
        return pinnedContainer
      }
      return undefined
    },
    saveUndoState: action => events.push(`undo:${action}`),
    saveBookmarks: () => events.push('save'),
    refreshDecoration: () => events.push('refresh'),
    expandPinnedContainer: container => events.push(`expand:${container.id}`),
  }

  inputResults.push('入口 │ 处理')
  await runForceAddBookmark(editor, port)
  assert.equal(bookmarks.length, 2)
  assert.equal(bookmarks[0].label, '入口')
  assert.equal(bookmarks[1].label, '处理')
  assert.equal(bookmarks[1].content, 'beta')
  assert.equal(contextUpdates, 2)
  assert.match(inputOptions[0].prompt, /请输入 2 个书签标签/)
  assert.deepEqual(events, [
    'undo:addBookmarks',
    'add:0',
    'add:1',
    'expand:pinned',
    'save',
    'refresh',
  ])
  assert.equal(informationMessages.at(-1), '批量添加完成，新增结果：共 2 个书签：一级 2 个。')

  const protectedBookmark = new Bookmark({
    id: 'protected',
    path: 'source.ts',
    label: 'TODO',
    start: new CursorIndex(2, 0),
    end: new CursorIndex(2, 7),
  })
  bookmarks.push(protectedBookmark)
  protectedIds.add(protectedBookmark.id)
  const deletedBookmarkId = bookmarks[0].id
  editor.selections = [selection(0), selection(0), selection(2)]
  events.length = 0
  await runForceDeleteBookmark(editor, port)
  assert.deepEqual(events, [
    'undo:deleteBookmarks',
    `delete:${deletedBookmarkId}`,
    'warn:1',
    'save',
    'refresh',
  ])
  assert.ok(bookmarks.includes(protectedBookmark))

  const existing = bookmarks.find(bookmark => bookmark.start.line === 1)
  editor.selections = [selection(1), selection(3)]
  events.length = 0
  inputResults.push(undefined)
  await runToggleBookmark(editor, port)
  assert.deepEqual(events, [])
  assert.ok(bookmarks.includes(existing))

  inputResults.push('新增节点')
  await runToggleBookmark(editor, port)
  assert.deepEqual(events, [
    'undo:toggleBookmarks',
    `delete:${existing.id}`,
    'add:3',
    'save',
    'refresh',
  ])
  assert.equal(bookmarks.some(bookmark => bookmark.start.line === 1), false)
  assert.equal(bookmarks.some(bookmark => bookmark.start.line === 3), true)

  editor.selections = [selection(0)]
  events.length = 0
  inputResults.push('   ')
  await runForceAddBookmark(editor, port)
  assert.deepEqual(events, [])
  assert.equal(warningMessages.at(-1), '标签不能为空')
}

main().then(
  () => console.log('ManualBookmarkWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
