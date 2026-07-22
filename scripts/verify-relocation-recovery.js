const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-relocation-recovery-'))
const storageRoot = path.join(sandbox, 'storage')
const sourceWorkspace = path.join(sandbox, 'source-workspace')
const targetWorkspace = path.join(sandbox, 'target-workspace')
const scriptFolder = path.join(storageRoot, 'scripts')
fs.mkdirSync(scriptFolder, { recursive: true })
fs.mkdirSync(targetWorkspace, { recursive: true })

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

const workspaceFolder = { uri: { scheme: 'file', fsPath: targetWorkspace } }
const vscodeMock = {
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {},
  ThemeColor: class {},
  MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    workspaceFolders: [workspaceFolder],
    textDocuments: [],
    getWorkspaceFolder: uri => {
      const relative = path.relative(targetWorkspace, path.resolve(uri.fsPath))
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? workspaceFolder : undefined
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

const { stableWorkspacePathHash } = require('../out/util/PathHash')
const { createScriptRelocation } = require('../out/repository/ScriptRelocationJournal')
const { bookmarkRepository } = require('../out/repository/BookmarkRepository')

function fingerprint(content) {
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    size: Buffer.byteLength(content),
  }
}

function envelope(id, scriptPath, content, bookmarkId) {
  return {
    script: { id, path: scriptPath, fingerprint: fingerprint(content), lastSeenAt: Date.now() },
    bookmarks: [{
      id: bookmarkId, createdAt: Date.now(), label: bookmarkId, path: scriptPath,
      collapsibleState: 0, pinned: false, content: content.trim(), iconName: '',
      isInvalid: false, params: '0,0,0,0', subs: [],
    }],
  }
}

async function main() {
  const sourceScope = path.join(storageRoot, 'scopes', `${path.basename(sourceWorkspace)}_${stableWorkspacePathHash(sourceWorkspace)}`)
  const targetScope = path.join(storageRoot, 'scopes', `${path.basename(targetWorkspace)}_${stableWorkspacePathHash(targetWorkspace)}`)
  const sourceDirectory = path.join(sourceWorkspace, 'src', 'source')
  const targetDirectory = path.join(targetWorkspace, 'src', 'target')
  fs.mkdirSync(sourceScope, { recursive: true })
  fs.mkdirSync(targetScope, { recursive: true })
  fs.mkdirSync(targetDirectory, { recursive: true })

  const idA = '10000000-0000-9000-1000-000000000011'
  const idB = '10000000-0000-9000-1000-000000000012'
  const contentA = 'const recoveredA = true\n'
  const contentB = 'const recoveredB = true\n'
  const targetA = path.join(targetDirectory, 'a.ts')
  const targetB = path.join(targetDirectory, 'b.ts')
  fs.writeFileSync(targetA, contentA)
  fs.writeFileSync(targetB, contentB)

  fs.writeFileSync(path.join(scriptFolder, `${idA}.json`), JSON.stringify(envelope(idA, targetA, contentA, 'bookmark-a')))
  fs.writeFileSync(path.join(scriptFolder, `${idB}.json`), JSON.stringify(envelope(idB, path.join(sourceDirectory, 'b.ts'), contentB, 'bookmark-b')))
  fs.writeFileSync(path.join(sourceScope, '_workspace_order.json'), JSON.stringify(['src/source/a.ts', 'src/source/b.ts']))
  await createScriptRelocation(storageRoot, {
    oldAbsolutePath: sourceDirectory,
    newAbsolutePath: targetDirectory,
    oldBookmarkFolder: sourceScope,
    newBookmarkFolder: targetScope,
    oldBookmarkPath: 'src/source',
    newBookmarkPath: 'src/target',
  })

  const loaded = await bookmarkRepository.readBookmarksFromFile([targetA])
  assert.deepEqual(loaded.map(node => node.scriptId).sort(), [idA, idB])
  const recoveredB = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${idB}.json`), 'utf8'))
  assert.equal(path.resolve(recoveredB.script.path), path.resolve(targetB))
  assert.equal(path.resolve(recoveredB.bookmarks[0].path), path.resolve(targetB))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(targetScope, '_workspace_order.json'), 'utf8')), [
    'src/target/a.ts',
    'src/target/b.ts',
  ])
  assert.equal(fs.existsSync(path.join(storageRoot, '.script-relocations')), false)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
