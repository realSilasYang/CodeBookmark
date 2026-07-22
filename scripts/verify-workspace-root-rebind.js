const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-root-rebind-'))
const storageRoot = path.join(sandbox, 'storage')
const oldRoot = path.join(sandbox, 'old-workspace')
const newRoot = path.join(sandbox, 'renamed-workspace')
const scriptFolder = path.join(storageRoot, 'scripts')
fs.mkdirSync(path.join(newRoot, 'src'), { recursive: true })
fs.mkdirSync(scriptFolder, { recursive: true })

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
const workspaceFolder = { uri: { scheme: 'file', fsPath: newRoot } }
const vscodeMock = {
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {}, ThemeColor: class {}, MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    workspaceFolders: [workspaceFolder], textDocuments: [],
    getWorkspaceFolder: uri => {
      const relative = path.relative(newRoot, path.resolve(uri.fsPath))
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
const { bookmarkRepository } = require('../out/repository/BookmarkRepository')

function fingerprint(content) {
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    size: Buffer.byteLength(content),
  }
}
function envelope(id, sourcePath, content) {
  return {
    script: { id, path: sourcePath, fingerprint: fingerprint(content), lastSeenAt: Date.now() },
    bookmarks: [{
      id: `bookmark-${id}`, createdAt: Date.now(), label: path.basename(sourcePath), path: sourcePath,
      collapsibleState: 0, pinned: false, content: content.trim(), iconName: '',
      isInvalid: false, params: '0,0,0,0', subs: [],
    }],
  }
}

async function main() {
  const ids = [
    '10000000-0000-9000-1000-000000000051',
    '10000000-0000-9000-1000-000000000052',
  ]
  const names = ['a.ts', 'b.ts']
  for (let index = 0; index < names.length; index++) {
    const content = `const rootRebind${index} = true\n`
    const nextPath = path.join(newRoot, 'src', names[index])
    const previousPath = path.join(oldRoot, 'src', names[index])
    fs.writeFileSync(nextPath, content)
    fs.writeFileSync(path.join(scriptFolder, `${ids[index]}.json`), JSON.stringify(envelope(ids[index], previousPath, content)))
  }
  const oldScope = path.join(storageRoot, 'scopes', `${path.basename(oldRoot)}_${stableWorkspacePathHash(oldRoot)}`)
  const newScope = path.join(storageRoot, 'scopes', `${path.basename(newRoot)}_${stableWorkspacePathHash(newRoot)}`)
  fs.mkdirSync(oldScope, { recursive: true })
  fs.writeFileSync(path.join(oldScope, '_workspace_order.json'), JSON.stringify(['src/b.ts', 'src/a.ts']))

  const loaded = await bookmarkRepository.readBookmarksFromFile([path.join(newRoot, 'src', 'a.ts')])
  assert.deepEqual(loaded.map(node => node.scriptId).sort(), ids)
  for (let index = 0; index < ids.length; index++) {
    const data = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${ids[index]}.json`), 'utf8'))
    assert.equal(path.resolve(data.script.path), path.resolve(newRoot, 'src', names[index]))
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(newScope, '_workspace_order.json'), 'utf8')), ['src/b.ts', 'src/a.ts'])
  assert.equal(fs.existsSync(oldScope), false)
  assert.equal(fs.existsSync(path.join(storageRoot, '.script-relocations')), false)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
