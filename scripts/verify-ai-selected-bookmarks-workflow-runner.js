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
const { UserCancelledError } = require('../out/i18n/Localization')
const { AITaskRegistry } = require('../out/providers/AITaskRegistry')
const { AIWorkflowGuard } = require('../out/providers/AIWorkflowGuard')
const { runOptimizeSelectedBookmarks } = require('../out/providers/AISelectedBookmarksWorkflowRunner')
restoreModules()

function bookmark(id, bookmarkPath, label, contextValue = 'bookmark') {
  return {
    id,
    path: bookmarkPath,
    label,
    contextValue,
    icon: '',
    isUsingDefaultIcon: true,
    defaultIconName: '',
    refreshCount: 0,
    toJSON() {
      return { id: this.id, path: this.path, label: this.label }
    },
    refreshDisplayProps() {
      this.refreshCount++
    },
  }
}

async function main() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-ai-selected-'))
  const fileA = path.join(folder, 'a.ts')
  const fileB = path.join(folder, 'b.ts')
  fs.writeFileSync(fileA, 'const a = 1\n', 'utf8')
  fs.writeFileSync(fileB, 'const b = 2\n', 'utf8')

  const originalConfirmSourceSize = AIService.confirmSourceSize
  const originalOptimizeBookmarks = AIService.optimizeBookmarks
  try {
    AIService.confirmSourceSize = async () => undefined
    const a1 = bookmark('a1', 'a.ts', '甲一')
    const a2 = bookmark('a2', 'a.ts', '甲二')
    const b1 = bookmark('b1', 'b.ts', '乙一')
    const bookmarksByPath = new Map([
      ['a.ts', [a1, a2]],
      ['b.ts', [b1]],
    ])
    const scope = 'workspace:selected'
    const events = []
    const optimizeBatches = []
    const taskRegistry = new AITaskRegistry()
    const bookmarksForPath = pathRel => bookmarksByPath.get(pathRel) ?? []
    const relativePath = filePath => path.relative(folder, filePath).replace(/\\/g, '/')
    const workflowGuard = new AIWorkflowGuard({
      currentStorageScope: () => scope,
      bookmarksForPath,
    })
    const port = {
      absoluteToRelative: relativePath,
      absoluteBookmarkPath: bookmarkPath => path.join(folder, bookmarkPath),
      storageScopeForUri: () => scope,
      currentStorageScope: () => scope,
      taskRegistry,
      workflowGuard,
      bookmarksForPath,
      resolveTargets: (target, selected) => selected ?? (target ? [target] : []),
      deleteBookmark() {},
      addBookmark() {},
      saveUndoState: action => events.push(`undo:${action}`),
      saveBookmarks: filePaths => events.push(`save:${path.basename(filePaths[0])}`),
      refreshDecoration: () => events.push('refresh'),
      findBookmark: candidate => bookmarksForPath(candidate.path)
        .find(current => current.id === candidate.id),
      assignAIIcons: () => true,
    }

    AIService.optimizeBookmarks = async (_content, filePath, candidates, onStatus) => {
      optimizeBatches.push({ file: path.basename(filePath), ids: candidates.map(candidate => candidate.id) })
      onStatus(`优化 ${path.basename(filePath)}`)
      return candidates.map(candidate => ({ id: candidate.id, new_label: `优化${candidate.id}` }))
    }
    await runOptimizeSelectedBookmarks(undefined, [a1, a2, b1], port)

    assert.deepEqual(optimizeBatches, [
      { file: 'a.ts', ids: ['a1', 'a2'] },
      { file: 'b.ts', ids: ['b1'] },
    ])
    assert.deepEqual(events, [
      'undo:optimizeAIBookmarks',
      'save:a.ts',
      'save:b.ts',
      'refresh',
    ])
    assert.equal(a1.label, '优化 a1')
    assert.equal(a2.label, '优化 a2')
    assert.equal(b1.label, '优化 b1')
    assert.equal(a1.refreshCount, 1)
    assert.equal(informationMessages.at(-2), '选中书签优化完成，更新结果：共 2 个书签：一级 2 个。')
    assert.equal(informationMessages.at(-1), '选中书签优化完成，更新结果：共 1 个书签：一级 1 个。')
    assert.ok(statusMessages.every(status => status.disposed))

    const invalid = bookmark('file', 'a.ts', '文件', 'file')
    await runOptimizeSelectedBookmarks(invalid, undefined, port)
    assert.equal(informationMessages.at(-1), '选中的项不包含可优化的书签。')

    AIService.optimizeBookmarks = async () => {
      throw new UserCancelledError('主动取消', 'Cancelled')
    }
    await runOptimizeSelectedBookmarks(a1, undefined, port)
    assert.match(informationMessages.at(-1), /已取消 AI 选中书签优化任务：a\.ts/)
    assert.equal(errorMessages.length, 0)
    assert.equal(warningMessages.length, 0)
    for (const filePath of [fileA, fileB]) {
      assert.equal(taskRegistry.isFileRunning(taskRegistry.fileTaskKey(scope, relativePath(filePath))), false)
    }
  } finally {
    AIService.confirmSourceSize = originalConfirmSourceSize
    AIService.optimizeBookmarks = originalOptimizeBookmarks
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('AISelectedBookmarksWorkflowRunner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
