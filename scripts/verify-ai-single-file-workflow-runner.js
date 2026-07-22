const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const informationMessages = []
const warningMessages = []
const errorMessages = []
const statusMessages = []
const token = { isCancellationRequested: false }
const { vscode } = createVscodeFake({
  ProgressLocation: { Notification: 15 },
  window: {
    showInformationMessage: message => { informationMessages.push(message) },
    showWarningMessage: message => { warningMessages.push(message) },
    showErrorMessage: message => { errorMessages.push(message) },
    setStatusBarMessage: message => {
      const status = { message, disposed: false }
      statusMessages.push(status)
      return { dispose: () => { status.disposed = true } }
    },
    withProgress: async (_options, operation) => operation({ report() {} }, token),
  },
})
const restoreModules = installModuleMocks({ vscode })
const { AIService } = require('../out/util/AIService')
const { AITaskRegistry } = require('../out/providers/AITaskRegistry')
const { AIWorkflowGuard } = require('../out/providers/AIWorkflowGuard')
const {
  runGenerateBookmarksForFile,
  runOptimizeBookmarksForFile,
} = require('../out/providers/AISingleFileWorkflowRunner')
restoreModules()

async function main() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-ai-single-'))
  const filePath = path.join(folder, 'source.ts')
  const source = 'const value = 1\nconsume(value)\n'
  fs.writeFileSync(filePath, source, 'utf8')

  const originalConfirmSourceSize = AIService.confirmSourceSize
  const originalGenerateBookmarks = AIService.generateBookmarks
  const originalOptimizeBookmarks = AIService.optimizeBookmarks
  try {
    let generateCalls = 0
    AIService.confirmSourceSize = async () => undefined
    AIService.generateBookmarks = async (_content, _filePath, onStatus) => {
      generateCalls++
      onStatus('分析源码')
      return [{
        label: '值初始化',
        line: 0,
        content: 'const value = 1',
        subs: [{ label: '使用值', line: 1, content: 'consume(value)', subs: [] }],
      }]
    }

    const document = {
      uri: { fsPath: filePath },
      version: 1,
      getText: () => source,
    }
    const editor = { document }
    const bookmarks = []
    const events = []
    const scope = 'workspace:test'
    const pathRel = 'source.ts'
    const taskRegistry = new AITaskRegistry()
    const workflowGuard = new AIWorkflowGuard({
      currentStorageScope: () => scope,
      bookmarksForPath: () => bookmarks,
    })
    const port = {
      absoluteToRelative: () => pathRel,
      storageScopeForUri: () => scope,
      taskRegistry,
      workflowGuard,
      bookmarksForPath: () => bookmarks,
      documentLines: () => source.split(/\r\n|\n|\r/),
      deleteBookmark: id => {
        events.push(`delete:${id}`)
        const index = bookmarks.findIndex(bookmark => bookmark.id === id)
        if (index >= 0) bookmarks.splice(index, 1)
      },
      addBookmark: bookmark => {
        events.push('add')
        bookmarks.push(bookmark)
      },
      saveUndoState: action => events.push(`undo:${action}`),
      saveBookmarks: filePaths => events.push(`save:${filePaths.join(',')}`),
      refreshDecoration: () => events.push('refresh'),
      findBookmark: candidate => bookmarks.find(bookmark => bookmark.id === candidate.id),
      assignAIIcons: () => true,
    }

    await runGenerateBookmarksForFile(editor, 'append', port)
    assert.equal(generateCalls, 1)
    assert.equal(bookmarks.length, 1)
    assert.equal(bookmarks[0].subs.size, 1)
    assert.equal(typeof bookmarks[0].id, 'string')
    assert.deepEqual(events, [
      'undo:generateAIBookmarks',
      'add',
      `save:${filePath}`,
      'refresh',
    ])
    assert.equal(informationMessages.at(-1), 'AI 分析完成，生成结果：共 2 个书签：一级 1 个、二级 1 个。')
    assert.equal(taskRegistry.isFileRunning(taskRegistry.fileTaskKey(scope, pathRel)), false)
    assert.ok(statusMessages.every(status => status.disposed))

    await runGenerateBookmarksForFile(editor, 'skip_existing', port)
    assert.equal(generateCalls, 1)
    assert.equal(informationMessages.at(-1), '当前文件已有书签，根据模式已跳过生成。')

    const generatedBookmark = bookmarks[0]
    AIService.optimizeBookmarks = async (_content, _filePath, candidates, onStatus) => {
      onStatus('优化标签')
      return [{ id: candidates[0].id, new_label: '更新标签' }]
    }
    events.length = 0
    await runOptimizeBookmarksForFile(editor, port)
    assert.equal(generatedBookmark.label, '更新标签')
    assert.deepEqual(events, [
      'undo:optimizeAIBookmarks',
      `save:${filePath}`,
      'refresh',
    ])
    assert.equal(informationMessages.at(-1), 'AI 书签优化完成，更新结果：共 1 个书签：一级 1 个。')
    assert.equal(warningMessages.length, 0)
    assert.equal(errorMessages.length, 0)
  } finally {
    AIService.confirmSourceSize = originalConfirmSourceSize
    AIService.generateBookmarks = originalGenerateBookmarks
    AIService.optimizeBookmarks = originalOptimizeBookmarks
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('AISingleFileWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
