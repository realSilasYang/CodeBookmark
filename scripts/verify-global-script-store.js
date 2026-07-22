const assert = require('node:assert/strict')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-global-store-'))
const storageRoot = path.join(sandbox, 'storage')
const workspaceRoot = path.join(sandbox, 'workspace')
const sourcePath = path.join(workspaceRoot, 'src', 'saved.ts')
fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
fs.writeFileSync(sourcePath, 'const savedGlobally = true\n')

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
let workspaceFolders = [{ uri: { scheme: 'file', fsPath: workspaceRoot } }]
const vscodeMock = {
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {}, ThemeColor: class {}, MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    get workspaceFolders() { return workspaceFolders },
    textDocuments: [],
    getWorkspaceFolder: uri => {
      const folder = workspaceFolders?.[0]
      if (!folder) return undefined
      const relative = path.relative(workspaceRoot, path.resolve(uri.fsPath))
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? folder : undefined
    },
    getConfiguration: section => ({
      get: key => {
        if (section === 'codebookmark' && key === 'globalStoragePath') return storageRoot
        if (section === 'codebookmark' && key === 'autoSpace') return true
        return undefined
      },
    }),
  },
  window: {
    activeTextEditor: undefined,
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showQuickPick: async items => items[0],
  },
  commands: { executeCommand: async () => undefined },
}
installModuleMocks({ vscode: vscodeMock })

const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { ContextBookmark } = require('../out/util/ContextValue')
const { bookmarkRepository } = require('../out/repository/BookmarkRepository')

async function main() {
  const scriptId = '10000000-0000-9000-1000-000000000061'
  const displayPath = 'src/saved.ts'
  const fileNode = new Bookmark({
    id: `file_${scriptId}`,
    path: displayPath,
    scriptId,
    contextValue: ContextBookmark.File,
    collapsible: 2,
  })
  const bookmark = new Bookmark({
    id: 'saved-bookmark', label: 'Saved globally', path: displayPath,
    start: new CursorIndex(0, 0), end: new CursorIndex(0, 0),
    content: 'const savedGlobally = true',
  })
  bookmark.parent = fileNode
  fileNode.subs.add(bookmark)
  const tree = new BookmarkSet([fileNode])

  assert.equal(await bookmarkRepository.saveBookmarksToFile(tree, [sourcePath]), true)
  const configPath = path.join(storageRoot, 'scripts', `${scriptId}.json`)
  assert.equal(fs.existsSync(configPath), true)
  const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  assert.equal(Object.hasOwn(stored, 'version'), false)
  assert.equal(path.resolve(stored.script.path), path.resolve(sourcePath))
  assert.equal(path.resolve(stored.bookmarks[0].path), path.resolve(sourcePath))

  workspaceFolders = undefined
  const standalone = await bookmarkRepository.readBookmarksFromFile([sourcePath])
  assert.equal(standalone.length, 1)
  assert.equal(standalone[0].scriptId, scriptId)
  assert.equal(path.resolve(standalone[0].path), path.resolve(sourcePath))

  const welcomeOnly = await bookmarkRepository.readBookmarksFromFile([])
  assert.deepEqual(welcomeOnly, [])
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
