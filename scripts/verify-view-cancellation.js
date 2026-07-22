const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const providerSource = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const preparationSource = fs.readFileSync('src/providers/BookmarkViewPreparation.ts', 'utf8')
const repositorySource = fs.readFileSync('src/repository/BookmarkRepository.ts', 'utf8')
const viewLoadSessionSource = fs.readFileSync('src/providers/ViewLoadSession.ts', 'utf8')
const relocationRecoverySource = fs.readFileSync('src/repository/ScriptRelocationRecovery.ts', 'utf8')

assert.match(providerSource, /private beginViewLoad\(\): number \{[\s\S]*?this\.viewLoads\.begin\(\)/)
assert.match(viewLoadSessionSource, /begin\(\): number \{[\s\S]*?this\.abortController\.abort\(\)/)
assert.match(providerSource, /readBookmarks: \(activePaths, candidateSignal\) => bookmarkRepository\.readBookmarksFromFile\([\s\S]*?\[\.\.\.activePaths\][\s\S]*?candidateSignal/)
assert.match(providerSource, /readContentBookmarks: \(bookmarks, scopeFilePath, candidateSignal\) => fileUtils\.readContentBookmarkInFile\([\s\S]*?candidateSignal/)
assert.match(preparationSource, /const loaded = await port\.readBookmarks\(activePaths, signal\)/)
assert.match(preparationSource, /port\.readContentBookmarks\(bookmarks, target\.scopeFilePath, signal\)/)
assert.match(providerSource, /dispose\(\) \{[\s\S]*?this\.viewLoads\.dispose\(\)/)
assert.match(viewLoadSessionSource, /dispose\(\): void \{[\s\S]*?this\.abortController\.abort\(\)/)
assert.match(repositorySource, /async readBookmarksFromFile\([\s\S]*?signal\?: AbortSignal/)
assert.doesNotMatch(repositorySource, /showQuickPickWhileActive|CancellationTokenSource/)
assert.doesNotMatch(repositorySource, /findRelocatedSource\([^)]*true/)
assert.match(repositorySource, /recoverScriptRelocations\(storageRoot, \{[\s\S]*?checkCancelled: \(\) => throwIfReadCancelled\(signal\)/)
assert.doesNotMatch(repositorySource, /readPendingScriptRelocations/)
assert.match(relocationRecoverySource, /port\.checkCancelled\(\)/)
assert.match(relocationRecoverySource, /await completeScriptRelocation\(pending\.journalPath\)/)

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-view-cancellation-'))
const firstPath = path.join(sandbox, 'first.ts')
const secondPath = path.join(sandbox, 'second.ts')
const content = 'const sameContent = true\n'
fs.writeFileSync(firstPath, content)
fs.writeFileSync(secondPath, content)

let quickPickCalls = 0

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}

class MarkdownString {
  appendMarkdown() {}
  appendText() {}
  appendCodeblock() {}
}

const vscodeMock = {
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {},
  ThemeColor: class {},
  MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    workspaceFolders: undefined,
    textDocuments: [],
    getWorkspaceFolder: () => undefined,
    getConfiguration: () => ({ get: () => undefined }),
  },
  window: {
    activeTextEditor: undefined,
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showQuickPick: async items => {
      quickPickCalls++
      return items[0]
    },
  },
  commands: { executeCommand: async () => undefined },
}

const restoreModules = installModuleMocks({ vscode: vscodeMock })

const { bookmarkRepository } = require('../out/repository/BookmarkRepository')

async function main() {
  const hash = crypto.createHash('sha256').update(content).digest('hex')
  const fileNode = { path: path.join(sandbox, 'old.ts'), subs: { values: [] } }
  const data = {
    script: {
      id: '10000000-0000-9000-1000-000000000099',
      path: fileNode.path,
      fingerprint: { sha256: hash, size: Buffer.byteLength(content) },
      lastSeenAt: Date.now(),
    },
    bookmarks: [],
  }
  const candidates = await bookmarkRepository.sourceCandidateIndex([firstPath, secondPath])
  assert.equal(await bookmarkRepository.findRelocatedSource(fileNode, data, candidates), undefined)
  assert.equal(quickPickCalls, 0)

  const alreadyCancelled = new AbortController()
  alreadyCancelled.abort()
  assert.deepEqual(await bookmarkRepository.readBookmarksFromFile([], undefined, alreadyCancelled.signal), [])
  assert.equal(quickPickCalls, 0)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  restoreModules()
  fs.rmSync(sandbox, { recursive: true, force: true })
})
