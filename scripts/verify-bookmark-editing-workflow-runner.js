/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-editing-workflow-runner`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-editing-workflow-runner` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-editing-workflow-runner”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`bookmark`、`waitFor`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
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

class Selection {
  constructor(start, end) {
    this.start = start
    this.end = end
    this.active = end
  }
}

const inputResults = []
const inputOptions = []
const informationMessages = []
const warningMessages = []
let changeListener
let closeListener
let openedDocument
let documentSaveCount = 0

const { vscode } = createVscodeFake({
  Position,
  window: {
    activeTextEditor: undefined,
    showInputBox: async options => {
      inputOptions.push(options)
      return inputResults.shift()
    },
    showTextDocument: async document => document,
    showInformationMessage: message => { informationMessages.push(message) },
    showWarningMessage: message => { warningMessages.push(message) },
  },
  workspace: {
    openTextDocument: async uri => {
      let text = fs.readFileSync(uri.fsPath, 'utf8')
      openedDocument = {
        uri,
        isDirty: false,
        getText: () => text,
        replaceText: value => { text = value },
        save: async () => {
          documentSaveCount++
          openedDocument.isDirty = false
        },
      }
      return openedDocument
    },
    onDidChangeTextDocument: listener => {
      changeListener = listener
      return { disposed: false, dispose() { this.disposed = true } }
    },
    onDidCloseTextDocument: listener => {
      closeListener = listener
      return { disposed: false, dispose() { this.disposed = true } }
    },
  },
})
const restoreModules = installModuleMocks({ vscode })
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { CODE_MARKER_ICON } = require('../out/util/CodeMarkerScanner')
const {
  runChangeBookmarkIcons,
  runRenameBookmark,
  runRestoreDefaultBookmarkIcons,
  runTogglePinnedBookmark,
  runUpdateBookmarkPosition,
  runUpdateBookmarkPositionAndRename,
} = require('../out/providers/BookmarkEditingWorkflowRunner')
restoreModules()

function bookmark(id, label, bookmarkPath = 'src/sample.ts', parent) {
  return new Bookmark({
    id,
    label,
    path: bookmarkPath,
    parent,
    start: new CursorIndex(0, 0),
    end: new CursorIndex(0, 0),
  })
}

function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 1000
    const check = () => {
      if (predicate()) return resolve()
      if (Date.now() >= deadline) return reject(new Error('Timed out waiting for workflow completion'))
      setTimeout(check, 5)
    }
    check()
  })
}

async function main() {
  const events = []
  const currentBookmarks = new Map()
  const registeredDisposables = []
  let iconPicker
  const port = {
    resolveTargets: (target, selected) => selected || (target ? [target] : []),
    findBookmark: target => currentBookmarks.get(target.id),
    temporaryFolder: () => undefined,
    registerDisposables: (...disposables) => registeredDisposables.push(...disposables),
    absoluteBookmarkPath: bookmarkPath => `C:\\workspace\\${bookmarkPath.replace(/\//g, '\\')}`,
    canUpdateBookmarkInEditor: () => true,
    updateBookmarkContextAnchors: () => events.push('anchors'),
    showIconPicker: (initialIcon, defaultIcon, onDidSelectIcon) => {
      iconPicker = { initialIcon, defaultIcon, onDidSelectIcon }
    },
    pinBookmark: target => {
      target.isPinned = !target.isPinned
      return [target]
    },
    publishTreeChange: target => events.push(`tree:${target.id}`),
    revealPinnedBookmarkLater: target => events.push(`reveal:${target.id}`),
    saveUndoState: action => events.push(`undo:${action}`),
    saveBookmarks: paths => events.push(`save:${paths.join('|')}`),
    refreshDecoration: () => events.push('refresh'),
  }

  const single = bookmark('single', 'old')
  currentBookmarks.set(single.id, single)
  inputResults.push('new label')
  await runRenameBookmark(single, undefined, port)
  assert.equal(single.label, 'new label')
  assert.equal(inputOptions.at(-1).prompt, '编辑书签标签')
  assert.deepEqual(events, [
    'undo:renameBookmarks',
    'save:C:\\workspace\\src\\sample.ts',
    'refresh',
  ])

  events.length = 0
  inputResults.push('   ')
  await runRenameBookmark(single, undefined, port)
  assert.deepEqual(events, [])
  assert.equal(warningMessages.at(-1), '标签不能为空')

  const temporaryFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-editing-'))
  const parent = bookmark('parent', 'Parent')
  const first = bookmark('first', 'First', 'src/first.ts', parent)
  const second = bookmark('second', 'Second', 'src/second.ts', parent)
  currentBookmarks.set(first.id, first)
  currentBookmarks.set(second.id, second)
  port.temporaryFolder = () => temporaryFolder
  await runRenameBookmark(first, [first, second], port)
  assert.equal(fs.readFileSync(openedDocument.uri.fsPath, 'utf8'), '\tFirst\n\tSecond')
  assert.equal(registeredDisposables.length, 2)
  assert.match(informationMessages.at(-1), /按 Tab 键体现的层级仅供参考/)
  openedDocument.isDirty = true
  changeListener({ document: openedDocument })
  assert.equal(documentSaveCount, 1)
  openedDocument.replaceText('\tRenamed first\n\tRenamed second')
  events.length = 0
  closeListener(openedDocument)
  await waitFor(() => !fs.existsSync(openedDocument.uri.fsPath))
  assert.equal(first.label, 'Renamed first')
  assert.equal(second.label, 'Renamed second')
  assert.deepEqual(events, [
    'undo:renameBookmarks',
    'refresh',
    'save:C:\\workspace\\src\\first.ts|C:\\workspace\\src\\second.ts',
  ])
  assert.equal(informationMessages.at(-1), '批量重命名完成，更新结果：共 2 个书签：一级 0 个、二级 2 个。')
  assert.equal(registeredDisposables.every(disposable => disposable.disposed), true)
  fs.rmSync(temporaryFolder, { recursive: true, force: true })

  const sourceLines = ['zero', 'one', 'two', 'three selected text']
  const selection = new Selection(new Position(3, 0), new Position(3, 5))
  const document = {
    uri: { scheme: 'file', fsPath: 'C:\\workspace\\src\\sample.ts' },
    lineAt: line => ({ text: sourceLines[line] }),
    getText: range => sourceLines[range.start.line].slice(range.start.character, range.end.character),
  }
  vscode.window.activeTextEditor = { document, selection }
  events.length = 0
  await runUpdateBookmarkPosition(single, port)
  assert.equal(single.content, 'three')
  assert.deepEqual([single.start.line, single.start.column, single.end.line, single.end.column], [3, 0, 3, 5])
  assert.deepEqual(events, [
    'undo:updateBookmarkPosition',
    'anchors',
    'save:C:\\workspace\\src\\sample.ts',
    'refresh',
  ])

  events.length = 0
  inputResults.push('position label')
  await runUpdateBookmarkPositionAndRename(single, port)
  assert.equal(single.label, 'position label')
  assert.deepEqual(events, [
    'undo:updateBookmarkAndRename',
    'anchors',
    'save:C:\\workspace\\src\\sample.ts',
    'refresh',
  ])

  events.length = 0
  port.canUpdateBookmarkInEditor = () => false
  await runUpdateBookmarkPosition(single, port)
  assert.deepEqual(events, [])
  assert.equal(warningMessages.at(-1), '只能在书签所属文件中更新位置；跨文件移动会破坏文件级存储边界。')
  port.canUpdateBookmarkInEditor = () => true

  const markerA = bookmark('marker-a', 'TODO A', 'src/markers.ts')
  const markerB = bookmark('marker-b', 'TODO B', 'src/markers.ts')
  markerA.codeMarker = { iconCustomized: true }
  markerB.codeMarker = { iconCustomized: true }
  markerA.icon = 'custom-a.svg'
  markerB.icon = 'custom-b.svg'
  currentBookmarks.set(markerA.id, markerA)
  currentBookmarks.set(markerB.id, markerB)
  events.length = 0
  await runChangeBookmarkIcons(markerA, [markerA, markerB], port)
  assert.equal(iconPicker.initialIcon, '')
  assert.equal(iconPicker.defaultIcon, CODE_MARKER_ICON)
  iconPicker.onDidSelectIcon(CODE_MARKER_ICON)
  assert.equal(markerA.codeMarker.iconCustomized, false)
  assert.equal(markerB.codeMarker.iconCustomized, false)
  assert.deepEqual(events, [
    'undo:changeBookmarkIcons',
    'save:C:\\workspace\\src\\markers.ts',
    'refresh',
  ])

  markerA.icon = 'custom.svg'
  markerB.icon = 'custom.svg'
  markerA.codeMarker.iconCustomized = true
  markerB.codeMarker.iconCustomized = true
  events.length = 0
  await runRestoreDefaultBookmarkIcons(markerA, [markerA, markerB], port)
  assert.equal(markerA.icon, CODE_MARKER_ICON)
  assert.equal(markerB.icon, CODE_MARKER_ICON)
  assert.equal(markerA.codeMarker.iconCustomized, false)
  assert.equal(markerB.codeMarker.iconCustomized, false)
  assert.deepEqual(events, [
    'undo:restoreBookmarkIcons',
    'save:C:\\workspace\\src\\markers.ts',
    'refresh',
  ])

  const pinned = bookmark('pinned', 'Pinned', 'src/pinned.ts')
  const previouslyPinned = bookmark('previously-pinned', 'Previously pinned', 'src/previous.ts')
  previouslyPinned.isPinned = true
  currentBookmarks.set(pinned.id, pinned)
  currentBookmarks.set(previouslyPinned.id, previouslyPinned)
  port.pinBookmark = target => {
    target.isPinned = !target.isPinned
    if (!target.isPinned || !previouslyPinned.isPinned) return [target]
    previouslyPinned.isPinned = false
    return [target, previouslyPinned]
  }
  events.length = 0
  runTogglePinnedBookmark(pinned, port)
  assert.equal(pinned.isPinned, true)
  assert.equal(previouslyPinned.isPinned, false)
  assert.deepEqual(events, [
    'undo:setBookmarkContainer',
    'tree:pinned',
    'tree:previously-pinned',
    'save:C:\\workspace\\src\\pinned.ts|C:\\workspace\\src\\previous.ts',
    'refresh',
    'reveal:pinned',
  ])

  events.length = 0
  runTogglePinnedBookmark(pinned, port)
  assert.equal(pinned.isPinned, false)
  assert.deepEqual(events, [
    'undo:unsetBookmarkContainer',
    'tree:pinned',
    'save:C:\\workspace\\src\\pinned.ts',
    'refresh',
  ])
}

main().then(
  () => console.log('BookmarkEditingWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
