/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-folder-workflow-runner`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-folder-workflow-runner` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-folder-workflow-runner”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const informationMessages = []
const warningMessages = []
const errorMessages = []
const progressMessages = []
const statusMessages = []
const token = { isCancellationRequested: false }
const { vscode } = createVscodeFake({
  ProgressLocation: { Notification: 15 },
  window: {
    showInformationMessage: message => { informationMessages.push(message) },
    showWarningMessage: async (message, _options, confirmAction) => {
      warningMessages.push(message)
      return confirmAction
    },
    showErrorMessage: message => { errorMessages.push(message) },
    setStatusBarMessage: message => {
      const status = { message, disposed: false }
      statusMessages.push(status)
      return { dispose: () => { status.disposed = true } }
    },
    withProgress: async (_options, operation) => operation({
      report: value => progressMessages.push(value.message),
    }, token),
  },
})
const restoreModules = installModuleMocks({ vscode })
const { AIHttpStatusError, AIService } = require('../out/util/AIService')
const { AITaskRegistry } = require('../out/providers/AITaskRegistry')
const { AIWorkflowGuard } = require('../out/providers/AIWorkflowGuard')
const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const {
  runGenerateBookmarksForFolder,
  runOptimizeBookmarksForFolder,
} = require('../out/providers/AIFolderWorkflowRunner')
restoreModules()

async function main() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-ai-batch-'))
  const fileA = path.join(folder, 'a.ts')
  const fileB = path.join(folder, 'b.ts')
  const fileC = path.join(folder, 'c.ts')
  fs.writeFileSync(fileA, 'const a = 1\n', 'utf8')
  fs.writeFileSync(fileB, 'const b = 2\n', 'utf8')
  fs.writeFileSync(fileC, 'const c = 3\n', 'utf8')

  const originalConfirmSourceSize = AIService.confirmSourceSize
  const originalGenerateBookmarks = AIService.generateBookmarks
  const originalOptimizeBookmarks = AIService.optimizeBookmarks
  try {
    AIService.confirmSourceSize = async () => undefined
    AIService.generateBookmarks = async (content, filePath, onStatus) => {
      onStatus(`生成 ${path.basename(filePath)}`)
      return [{
        label: `生成${path.basename(filePath)}`,
        line: 0,
        content: content.trim(),
        subs: [],
      }]
    }

    const scope = 'workspace:batch'
		const target = { directory: folder, storageScope: scope }
    const bookmarksByPath = new Map()
    const events = []
    const taskRegistry = new AITaskRegistry()
    const relativePath = filePath => path.relative(folder, filePath).replace(/\\/g, '/')
    const bookmarksForPath = pathRel => bookmarksByPath.get(pathRel) ?? []
    const existingBookmark = (id, pathRel) => new Bookmark({
      id,
      path: pathRel,
      label: `已有 ${id}`,
      content: 'existing',
      start: new CursorIndex(1, 0),
      end: new CursorIndex(1, 1),
    })
    bookmarksByPath.set('a.ts', [existingBookmark('existing-a', 'a.ts')])
    bookmarksByPath.set('b.ts', [existingBookmark('existing-b', 'b.ts')])
    const workflowGuard = new AIWorkflowGuard({
      currentStorageScope: () => scope,
      bookmarksForPath,
    })
    const port = {
      absoluteToRelative: relativePath,
      storageScopeForUri: () => scope,
      currentStorageScope: () => scope,
      taskRegistry,
      workflowGuard,
      bookmarksForPath,
      deleteBookmark: id => {
        events.push(`delete:${id}`)
        for (const bookmarks of bookmarksByPath.values()) {
          const index = bookmarks.findIndex(bookmark => bookmark.id === id)
          if (index >= 0) bookmarks.splice(index, 1)
        }
      },
      addBookmark: bookmark => {
        events.push(`add:${bookmark.path}`)
        const bookmarks = bookmarksForPath(bookmark.path)
        if (!bookmarksByPath.has(bookmark.path)) bookmarksByPath.set(bookmark.path, bookmarks)
        bookmarks.push(bookmark)
      },
      saveUndoState: action => events.push(`undo:${action}`),
      saveBookmarks: filePaths => events.push(`save:${path.basename(filePaths[0])}`),
      refreshDecoration: () => events.push('refresh'),
      findBookmark: candidate => bookmarksForPath(candidate.path)
        .find(bookmark => bookmark.id === candidate.id),
      assignAIIcons: () => true,
    }
    await runGenerateBookmarksForFolder(target, 'append', port)
    assert.equal(bookmarksForPath('a.ts').length, 2)
    assert.equal(bookmarksForPath('b.ts').length, 2)
    assert.equal(bookmarksForPath('c.ts').length, 0)
    assert.deepEqual(events, [
      'undo:generateAIBookmarks',
      'add:a.ts',
      'save:a.ts',
      'add:b.ts',
      'save:b.ts',
      'refresh',
    ])
    assert.equal(progressMessages.length, 2)
    assert.equal(informationMessages.at(-1), '文件夹 AI 处理完成，已处理 2 个文件；生成结果：共 2 个书签：一级 2 个。')

    events.length = 0
    progressMessages.length = 0
    await runGenerateBookmarksForFolder(target, 'skip_existing', port)
    assert.equal(bookmarksForPath('a.ts').length, 2)
    assert.equal(bookmarksForPath('b.ts').length, 2)
    assert.equal(bookmarksForPath('c.ts').length, 1)
    assert.deepEqual(events, [
      'undo:generateAIBookmarks',
      'add:c.ts',
      'save:c.ts',
      'refresh',
    ])
    assert.equal(progressMessages.length, 1)
    bookmarksByPath.delete('c.ts')

    AIService.optimizeBookmarks = async (_content, filePath, candidates, onStatus) => {
      onStatus(`优化 ${path.basename(filePath)}`)
      const label = path.basename(filePath) === 'a.ts' ? '甲优化' : '乙优化'
      return [{ id: candidates[0].id, new_label: label }]
    }
    events.length = 0
    progressMessages.length = 0
    await runOptimizeBookmarksForFolder(target, port)
    assert.equal(bookmarksForPath('a.ts')[0].label, '甲优化')
    assert.equal(bookmarksForPath('b.ts')[0].label, '乙优化')
    assert.deepEqual(events, [
      'undo:optimizeAIBookmarks',
      'save:a.ts',
      'save:b.ts',
      'refresh',
    ])
    assert.equal(progressMessages.length, 2)
    assert.equal(informationMessages.at(-1), '文件夹 AI 优化完成，已处理 2 个文件；更新结果：共 2 个书签：一级 2 个。')

    const fileD = path.join(folder, 'd.ts')
    const fileE = path.join(folder, 'e.ts')
    fs.writeFileSync(fileD, 'const d = 4\n', 'utf8')
    fs.writeFileSync(fileE, 'const e = 5\n', 'utf8')
    bookmarksByPath.set('d.ts', [existingBookmark('existing-d', 'd.ts')])
    bookmarksByPath.set('e.ts', [existingBookmark('existing-e', 'e.ts')])
    let failedRequests = 0
    AIService.generateBookmarks = async () => {
      failedRequests++
      throw new Error('temporary failure')
    }
    const expectedLoggedErrors = []
    const originalConsoleError = console.error
    console.error = (...args) => expectedLoggedErrors.push(args)
    try {
      await runGenerateBookmarksForFolder(target, 'append', port)
      assert.equal(failedRequests, 3)
      assert.match(errorMessages.at(-1), /AI 请求连续失败 3 次/)
      assert.match(informationMessages.at(-1), /AI 文件夹任务已停止/)

      let authenticationRequests = 0
      AIService.generateBookmarks = async () => {
        authenticationRequests++
        throw new AIHttpStatusError(401, 'invalid key')
      }
      await runGenerateBookmarksForFolder(target, 'append', port)
      assert.equal(authenticationRequests, 1)
      assert.match(errorMessages.at(-1), /请检查 API Key 配置/)

      let rateLimitRequests = 0
      AIService.generateBookmarks = async () => {
        rateLimitRequests++
        throw new AIHttpStatusError(429, 'slow down')
      }
      await runGenerateBookmarksForFolder(target, 'append', port)
      assert.equal(rateLimitRequests, 1)
      assert.match(errorMessages.at(-1), /触发速率限制/)
    } finally {
      console.error = originalConsoleError
    }
    assert.equal(expectedLoggedErrors.length, 2)
    assert.equal(expectedLoggedErrors.filter(args => String(args[0]).includes('temporary failure')).length, 2)

    assert.equal(warningMessages.length, 0)
    assert.ok(statusMessages.every(status => status.disposed))
    assert.equal(taskRegistry.isFolderRunning(scope), false)
    for (const filePath of [fileA, fileB, fileC, fileD, fileE]) {
      assert.equal(taskRegistry.isFileRunning(taskRegistry.fileTaskKey(scope, relativePath(filePath))), false)
    }
  } finally {
    AIService.confirmSourceSize = originalConfirmSourceSize
    AIService.generateBookmarks = originalGenerateBookmarks
    AIService.optimizeBookmarks = originalOptimizeBookmarks
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('AIFolderWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
