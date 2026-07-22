const assert = require('node:assert/strict')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-repository-'))
const storageRoot = path.join(sandbox, 'storage')
const workspaceRoot = path.join(sandbox, 'workspace')
fs.mkdirSync(storageRoot, { recursive: true })
fs.mkdirSync(workspaceRoot, { recursive: true })

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

const workspaceFolder = { uri: { scheme: 'file', fsPath: workspaceRoot } }
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
      const relative = path.relative(workspaceRoot, path.resolve(uri.fsPath))
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

async function main() {
  const scriptFolder = path.join(storageRoot, 'scripts')
  const scopeFolder = path.join(storageRoot, 'scopes', `${path.basename(workspaceRoot)}_${stableWorkspacePathHash(workspaceRoot)}`)
  const sourceDirectory = path.join(workspaceRoot, 'src', 'source')
  const renamedDirectory = path.join(workspaceRoot, 'src', 'renamed')
  fs.mkdirSync(sourceDirectory, { recursive: true })
  fs.mkdirSync(scriptFolder, { recursive: true })
  fs.mkdirSync(scopeFolder, { recursive: true })

  const scriptIds = {
    'a.ts': '10000000-0000-9000-1000-000000000011',
    'b.ts': '10000000-0000-9000-1000-000000000012',
  }
  const bookmarkData = (id, label, scriptPath, params, extra = {}) => ({
    id, createdAt: Date.now(), label, path: scriptPath,
    collapsibleState: 0, pinned: false, iconName: '', isInvalid: false,
    params, subs: [], ...extra,
  })

  for (const name of ['a.ts', 'b.ts']) {
    const absolutePath = path.join(sourceDirectory, name)
    fs.writeFileSync(absolutePath, `// unique ${name}\nconst value = '${name}'\n`)
    const scriptId = scriptIds[name]
    fs.writeFileSync(path.join(scriptFolder, `${scriptId}.json`), JSON.stringify({
      script: { id: scriptId, path: absolutePath, lastSeenAt: Date.now() },
      bookmarks: [bookmarkData(name, name, absolutePath, '0,0,0,0')],
    }))
  }
  fs.writeFileSync(path.join(scopeFolder, '_workspace_order.json'), JSON.stringify([
    'src/source/a.ts',
    'src/source/b.ts',
  ]))

  fs.renameSync(sourceDirectory, renamedDirectory)
  await bookmarkRepository.handleFileRename(sourceDirectory, renamedDirectory)

  const configFiles = fs.readdirSync(scriptFolder).filter(file => /^[0-9a-f-]{36}\.json$/i.test(file))
  assert.equal(configFiles.length, 2)
  const configsByPath = new Map(configFiles.map(file => {
    const data = JSON.parse(fs.readFileSync(path.join(scriptFolder, file), 'utf8'))
    assert.equal(data.script.id, path.basename(file, '.json'))
    return [path.resolve(data.script.path), { file, data }]
  }))
  for (const name of ['a.ts', 'b.ts']) {
    const newAbsolutePath = path.join(renamedDirectory, name)
    assert.equal(configsByPath.has(path.resolve(newAbsolutePath)), true)
    assert.equal(path.resolve(configsByPath.get(path.resolve(newAbsolutePath)).data.bookmarks[0].path), path.resolve(newAbsolutePath))
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(scopeFolder, '_workspace_order.json'), 'utf8')), [
    'src/renamed/a.ts',
    'src/renamed/b.ts',
  ])

  const externallyRenamed = path.join(renamedDirectory, 'external.ts')
  fs.renameSync(path.join(renamedDirectory, 'a.ts'), externallyRenamed)
  const reloaded = await bookmarkRepository.readBookmarksFromFile([externallyRenamed])
  assert.equal(reloaded.some(node => node.path === 'src/renamed/external.ts'), true)
  const relinked = fs.readdirSync(scriptFolder)
    .filter(file => /^[0-9a-f-]{36}\.json$/i.test(file))
    .map(file => JSON.parse(fs.readFileSync(path.join(scriptFolder, file), 'utf8')))
    .find(data => path.resolve(data.script.path) === path.resolve(externallyRenamed))
  assert.equal(path.resolve(relinked.bookmarks[0].path), path.resolve(externallyRenamed))

  // A move can be observed as delete + create by external tools. The delete
  // side marks the configuration as missing; the later read must still use
  // its fingerprint to rebind it to the new file instead of leaving a stale
  // tombstone forever.
  const tombstoneId = '10000000-0000-9000-1000-000000000023'
  const tombstoneSource = path.join(renamedDirectory, 'tombstone.ts')
  const tombstoneTarget = path.join(renamedDirectory, 'recovered-tombstone.ts')
  const tombstoneContent = 'const recoveredAfterDeleteCreate = true\n'
  fs.writeFileSync(tombstoneSource, tombstoneContent)
  fs.writeFileSync(path.join(scriptFolder, `${tombstoneId}.json`), JSON.stringify({
    script: {
      id: tombstoneId,
      path: tombstoneSource,
      fingerprint: {
        sha256: require('node:crypto').createHash('sha256').update(tombstoneContent).digest('hex'),
        size: Buffer.byteLength(tombstoneContent),
      },
      lastSeenAt: Date.now(),
    },
    bookmarks: [bookmarkData('tombstone-bookmark', 'recovered', tombstoneSource, '0,0,0,0', {
      content: tombstoneContent.trim(),
    })],
  }))
  fs.writeFileSync(path.join(scopeFolder, '_workspace_order.json'), JSON.stringify([
    'src/renamed/external.ts',
    'src/renamed/tombstone.ts',
    'src/renamed/b.ts',
  ]))
  await bookmarkRepository.handleFileDelete(tombstoneSource)
  fs.renameSync(tombstoneSource, tombstoneTarget)
  await bookmarkRepository.handleFileAppearance(tombstoneTarget)
  const recoveredAfterDeleteCreate = await bookmarkRepository.readBookmarksFromFile([tombstoneTarget])
  assert.equal(recoveredAfterDeleteCreate.some(node => node.scriptId === tombstoneId), true)
  const recoveredConfig = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${tombstoneId}.json`), 'utf8'))
  assert.equal(path.resolve(recoveredConfig.script.path), path.resolve(tombstoneTarget))
  assert.equal(path.resolve(recoveredConfig.bookmarks[0].path), path.resolve(tombstoneTarget))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(scopeFolder, '_workspace_order.json'), 'utf8')), [
    'src/renamed/external.ts',
    'src/renamed/recovered-tombstone.ts',
    'src/renamed/b.ts',
  ])

  const automaticOnlyId = '10000000-0000-9000-1000-000000000021'
  const mixedId = '10000000-0000-9000-1000-000000000022'
  const automaticPath = path.join(renamedDirectory, 'automatic.ts')
  const mixedPath = path.join(renamedDirectory, 'mixed.ts')
  fs.writeFileSync(automaticPath, '// TODO: temporary\n')
  fs.writeFileSync(mixedPath, '// BUG: parent\nconst keep = true\n')
  const automaticBookmark = (id, scriptPath, subs = []) => ({
    script: { id, path: scriptPath, lastSeenAt: Date.now() },
    bookmarks: [bookmarkData(`marker-${id}`, 'TODO', scriptPath, '0,3,0,3', {
      content: '// TODO',
      codeMarker: { type: 'code-marker', marker: 'TODO', generatedLabel: 'TODO', iconCustomized: false },
      subs,
    })],
  })
  fs.writeFileSync(path.join(scriptFolder, `${automaticOnlyId}.json`), JSON.stringify(automaticBookmark(automaticOnlyId, automaticPath)))
  fs.writeFileSync(path.join(scriptFolder, `${mixedId}.json`), JSON.stringify(automaticBookmark(
    mixedId,
    mixedPath,
    [bookmarkData('manual-child', 'manual child', mixedPath, '1,0,1,0', { content: 'const keep = true' })],
  )))

  fs.rmSync(renamedDirectory, { recursive: true, force: true })
  await bookmarkRepository.handleFileDelete(renamedDirectory)
  for (const { file } of configsByPath.values()) {
    const data = JSON.parse(fs.readFileSync(path.join(scriptFolder, file), 'utf8'))
    assert.equal(typeof data.script.missingSince, 'number')
  }
  const automaticTombstone = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${automaticOnlyId}.json`), 'utf8'))
  assert.equal(typeof automaticTombstone.script.missingSince, 'number')
  assert.equal(automaticTombstone.bookmarks[0].codeMarker.type, 'code-marker')
  const mixedTombstone = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${mixedId}.json`), 'utf8'))
	assert.equal(mixedTombstone.bookmarks.length, 1)
	assert.equal(mixedTombstone.bookmarks[0].codeMarker.type, 'code-marker')
	assert.equal(mixedTombstone.bookmarks[0].subs[0].id, 'manual-child')
  assert.equal(fs.existsSync(path.join(scopeFolder, '_workspace_order.json')), false)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
