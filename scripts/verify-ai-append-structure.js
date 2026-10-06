/**
 * 验证 AI 追加复用原父节点、保留手动结构、跨分段合并，并在单文件和文件夹流程中正确落盘。
 * AI 回复使用固定数据；书签构建、插入、撤销快照和持久化结构使用真实领域对象。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const errors = []
const { vscode } = createVscodeFake({
  ProgressLocation: { Notification: 15 },
  window: {
    showErrorMessage: message => errors.push(message),
    withProgress: async (_options, operation) => operation({ report() {} }, { isCancellationRequested: false }),
    setStatusBarMessage: () => ({ dispose() {} }),
  },
})
const restoreModules = installModuleMocks({ vscode })
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { buildAIBookmarks, insertGeneratedAIBookmark } = require('../out/providers/AIBookmarkBuilder')
const { AIService } = require('../out/util/AIService')
const { splitAIGenerationChunks } = require('../out/util/AIGenerationChunks')
const { AITaskRegistry } = require('../out/providers/AITaskRegistry')
const { AIWorkflowGuard } = require('../out/providers/AIWorkflowGuard')
const { runGenerateBookmarksForFile } = require('../out/providers/AISingleFileWorkflowRunner')
const { runGenerateBookmarksForFolder } = require('../out/providers/AIFolderWorkflowRunner')
restoreModules()

const sourceLines = ['// Module A', '// Phase A', 'oldStep();', 'newStep();', '// New phase', 'newDetail();', '// Module B', 'newPeer();']
const aiNode = (line, subs = []) => ({ label: `AI ${line}`, line, content: sourceLines[line], subs })
const generatedTree = () => [aiNode(0, [aiNode(1, [aiNode(2), aiNode(3)]), aiNode(4, [aiNode(5)])]), aiNode(6, [aiNode(7)])]

function fixture() {
  const make = (line, parent) => {
    const bookmark = new Bookmark({
      id: `old-${line}`, path: 'sample.ts', label: `Manual ${line}`,
      icon: 'fun_rocket_fluent.svg', content: sourceLines[line],
      start: new CursorIndex(line, 0), end: new CursorIndex(line, sourceLines[line].length),
      createdAt: 100 + line, parent,
    })
    if (parent) parent.subs.add(bookmark)
    return bookmark
  }
  const moduleA = make(0)
  const phaseA = make(1, moduleA)
  const oldStep = make(2, phaseA)
  const moduleB = make(6)
  const file = moduleA.createContainingFileNode()
  for (const bookmark of [moduleA, moduleB]) {
    bookmark.parent = file
    file.subs.add(bookmark)
  }
  for (const bookmark of [moduleA, phaseA, oldStep, moduleB]) bookmark.ownerScriptId = file.scriptId
  const unrelatedPinned = new Bookmark({ path: 'other.ts', label: 'Unrelated pinned folder', isPinned: true })
  const tree = new BookmarkSet([file, unrelatedPinned])
  const bookmarksForPath = targetPath => {
    const result = []
    const visit = bookmark => {
      if (!bookmark.isFile && bookmark.path === targetPath) result.push(bookmark)
      for (const child of bookmark.subs) visit(child)
    }
    for (const root of tree) visit(root)
    return result
  }
  return { tree, file, moduleA, phaseA, oldStep, moduleB, unrelatedPinned, bookmarksForPath }
}

function assertMerged(current) {
  assert.deepEqual(current.file.subs.values.map(bookmark => bookmark.id), ['old-0', 'old-6'])
  assert.deepEqual(current.moduleA.subs.values.map(bookmark => bookmark.start.line), [1, 4])
  assert.deepEqual(current.phaseA.subs.values.map(bookmark => bookmark.start.line), [2, 3])
  assert.deepEqual(current.moduleA.subs.values[1].subs.values.map(bookmark => bookmark.start.line), [5])
  assert.deepEqual(current.moduleB.subs.values.map(bookmark => bookmark.start.line), [7])
  assert.equal(current.phaseA.subs.values[1].parent, current.phaseA)
  assert.equal(current.moduleA.subs.values[1].parent, current.moduleA)
  assert.equal(current.unrelatedPinned.subs.size, 0, 'An unrelated pinned node must not capture matched additions')
  for (const bookmark of [current.moduleA, current.phaseA, current.oldStep, current.moduleB]) {
    assert.equal(bookmark.label, `Manual ${bookmark.start.line}`)
    assert.equal(bookmark.icon, 'fun_rocket_fluent.svg')
    assert.equal(bookmark.createdAt, 100 + bookmark.start.line)
  }
}

function verifyBuilder() {
  const current = fixture()
  const before = JSON.stringify(current.file.toJSON())
  const built = buildAIBookmarks(generatedTree(), sourceLines, 'sample.ts', current.bookmarksForPath('sample.ts'), false, false)
  assert.equal(built.created, 4)
  assert.equal(built.skipped, 4)
  assert.equal(built.roots.length, 3)
  assert.equal(JSON.stringify(current.file.toJSON()), before, 'Building must not mutate the tree before undo is saved')
  for (const bookmark of built.roots) insertGeneratedAIBookmark(bookmark, current.tree)
  assertMerged(current)
  const repeat = buildAIBookmarks(generatedTree(), sourceLines, 'sample.ts', current.bookmarksForPath('sample.ts'), false, false)
  assert.equal(repeat.created, 0)
  assert.equal(repeat.roots.length, 0)
}

async function verifyChunkedContext() {
  const lines = Array.from({ length: 2500 }, (_, index) => `work${index}(); // ${'x'.repeat(190)}`)
  lines[0] = '// Existing module'
  const source = lines.join('\n')
  const chunks = splitAIGenerationChunks(source)
  assert.ok(chunks.length > 1)
  const parent = new Bookmark({ id: 'module', path: 'large.ts', label: 'Manual module', content: lines[0], start: new CursorIndex(0, 0) })
  const childLines = []
  const originalRequest = AIService.sendRequest
  let requests = 0
  try {
    AIService.sendRequest = async messages => {
      const chunk = chunks[requests++]
      const line = chunk.startLine + 1
      childLines.push(line)
      assert.match(messages[0].content, /existingBookmarks/)
      assert.match(messages[1].content, /"label":"Manual module"/)
      assert.match(messages[1].content, /"parentLineNumber":null/)
      return JSON.stringify({ bookmarks: [{
        label: 'Existing module', lineNumber: 1, anchor: lines[0],
        children: [{ label: 'New stage', lineNumber: line + 1, anchor: lines[line], children: [] }],
      }] })
    }
    const generated = await AIService.generateBookmarks(source, 'large.ts', undefined, undefined, [parent])
    assert.equal(requests, chunks.length)
    assert.equal(generated.length, 1)
    assert.deepEqual(generated[0].subs.map(bookmark => bookmark.line), childLines)
    const built = buildAIBookmarks(generated, lines, 'large.ts', [parent], false, false)
    assert.equal(built.created, chunks.length)
    assert.ok(built.roots.every(bookmark => bookmark.parent === parent))
    assert.equal(parent.subs.size, 0)
  } finally {
    AIService.sendRequest = originalRequest
  }
}

async function verifyWorkflows() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-ai-append-'))
  const sourceDirectory = path.join(tempRoot, 'source')
  fs.mkdirSync(sourceDirectory)
  const filePath = path.join(sourceDirectory, 'sample.ts')
  const storagePath = path.join(tempRoot, 'bookmarks.json')
  const source = sourceLines.join('\n')
  fs.writeFileSync(filePath, source, 'utf8')
  const originalGenerate = AIService.generateBookmarks
  const originalConfirm = AIService.confirmSourceSize
  try {
    AIService.confirmSourceSize = async () => undefined
    for (const mode of ['single', 'folder']) {
      const current = fixture()
      const before = JSON.stringify(current.file.toJSON())
      const scope = 'append-test'
      const events = []
      let requestCount = 0
      AIService.generateBookmarks = async (_source, _path, _status, _token, existing) => {
        requestCount++
        assert.deepEqual(existing.map(bookmark => bookmark.id), ['old-0', 'old-1', 'old-2', 'old-6'])
        return generatedTree()
      }
      const port = {
        absoluteToRelative: () => 'sample.ts',
        storageScopeForUri: () => scope,
        currentStorageScope: () => scope,
        taskRegistry: new AITaskRegistry(),
        workflowGuard: new AIWorkflowGuard({ currentStorageScope: () => scope, bookmarksForPath: current.bookmarksForPath }),
        bookmarksForPath: current.bookmarksForPath,
        documentLines: () => sourceLines,
        deleteBookmark: () => assert.fail('Append must never delete existing bookmarks'),
        addBookmark: bookmark => { events.push('add'); insertGeneratedAIBookmark(bookmark, current.tree) },
        saveUndoState: () => { events.push('undo'); assert.equal(JSON.stringify(current.file.toJSON()), before) },
        saveBookmarks: () => { fs.writeFileSync(storagePath, JSON.stringify(current.file.toJSON()), 'utf8') },
        refreshDecoration() {},
        persistGeneratedExpansion: async () => undefined,
        findBookmark: bookmark => current.tree.findBookmark(bookmark),
        assignAIIcons: () => false,
      }
      if (mode === 'single') {
        await runGenerateBookmarksForFile({ document: { uri: { fsPath: filePath }, version: 1, getText: () => source } }, 'append', port)
      } else {
        await runGenerateBookmarksForFolder({ directory: sourceDirectory, storageScope: scope }, 'append', port)
      }
      assert.equal(requestCount, 1, mode)
      assert.deepEqual(events, ['undo', 'add', 'add', 'add'], mode)
      assertMerged(current)
      const saved = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
      assert.deepEqual(saved.subs.map(bookmark => bookmark.id), ['old-0', 'old-6'])
      assert.equal(saved.subs[0].subs[0].subs.length, 2)
      assert.equal(saved.subs[0].subs[1].subs.length, 1)
      assert.equal(errors.length, 0, errors.join('\n'))
    }
  } finally {
    AIService.generateBookmarks = originalGenerate
    AIService.confirmSourceSize = originalConfirm
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

async function main() {
  verifyBuilder()
  await verifyChunkedContext()
  await verifyWorkflows()
  console.log('AI append structure verified for nested bookmarks, chunked source, single-file and folder workflows.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
