const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-script-id-'))
const storageRoot = path.join(sandbox, 'storage')
const workspaceRoot = path.join(sandbox, 'workspace')
const sourceScript = path.join(workspaceRoot, 'source.ts')
const renamedScript = path.join(workspaceRoot, 'renamed.ts')
const changedScript = path.join(workspaceRoot, 'moved', 'changed-name.ts')
fs.mkdirSync(path.join(storageRoot, 'scripts'), { recursive: true })
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

let workspaceFolders = [{ uri: { scheme: 'file', fsPath: workspaceRoot } }]
const getWorkspaceFolder = uri => {
  const folder = workspaceFolders?.[0]
  if (!folder) return undefined
  const relative = path.relative(folder.uri.fsPath, path.resolve(uri.fsPath))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? folder : undefined
}
const vscodeMock = {
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {},
  ThemeColor: class {},
  MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    get workspaceFolders() { return workspaceFolders },
    textDocuments: [],
    getWorkspaceFolder,
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
    showWarningMessage: async (_message, _options, continueLabel) => continueLabel,
    showInformationMessage: async () => undefined,
    showQuickPick: async items => items[0],
  },
  commands: { executeCommand: async () => undefined },
}

installModuleMocks({ vscode: vscodeMock })

const { bookmarkRepository } = require('../out/repository/BookmarkRepository')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const { fingerprintSourceFile } = require('../out/util/ScriptIdentity')

function fingerprint(content) {
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    size: Buffer.byteLength(content),
  }
}

async function main() {
	const sameSizePath = path.join(sandbox, 'same-size.ts')
	fs.writeFileSync(sameSizePath, 'aaaa')
	const firstSameSizeFingerprint = await fingerprintSourceFile(sameSizePath)
	fs.writeFileSync(sameSizePath, 'bbbb')
	const secondSameSizeFingerprint = await fingerprintSourceFile(sameSizePath)
	assert.notEqual(firstSameSizeFingerprint.sha256, secondSameSizeFingerprint.sha256)

	const content = 'const stableIdentity = true\n'
	fs.writeFileSync(sourceScript, content)
  const scriptId = '10000000-0000-9000-1000-000000000031'
  const configPath = path.join(storageRoot, 'scripts', scriptId + '.json')
  fs.writeFileSync(configPath, JSON.stringify({
    script: { id: scriptId, path: sourceScript, fingerprint: fingerprint(content), lastSeenAt: Date.now() },
    bookmarks: [{
      id: 'bookmark', createdAt: Date.now(), label: 'Stable identity',
      path: sourceScript, collapsibleState: 0, pinned: false,
      content: 'const stableIdentity = true', iconName: '', isInvalid: false,
      params: '0,0,0,0', subs: [],
    }],
  }))

  const changedScriptId = '10000000-0000-9000-1000-000000000032'
  const changedConfigPath = path.join(storageRoot, 'scripts', changedScriptId + '.json')
  const previousChangedPath = path.join(sandbox, 'previous-device', 'original-name.ts')
  const previousChangedContent = 'const relocationHeader = true\nfunction preservedAnchor() {\n  return true\n}\n'
  const currentChangedContent = 'const relocationHeader = true\nconst insertedOnAnotherDevice = true\nfunction preservedAnchor() {\n  return insertedOnAnotherDevice\n}\n'
  fs.mkdirSync(path.dirname(changedScript), { recursive: true })
  fs.writeFileSync(changedScript, currentChangedContent)
  fs.writeFileSync(changedConfigPath, JSON.stringify({
    script: {
      id: changedScriptId,
      path: previousChangedPath,
      fingerprint: {
        ...fingerprint(previousChangedContent),
        device: 'previous-device',
        inode: 'previous-inode',
      },
      lastSeenAt: Date.now(),
    },
    bookmarks: [{
      id: 'changed-bookmark', createdAt: Date.now(), label: 'Cross-device edit',
      path: previousChangedPath, collapsibleState: 0, pinned: false,
      content: 'function preservedAnchor() {',
      contextBefore: 'const relocationHeader = true',
      contextAfter: 'return true',
      iconName: '', isInvalid: false, params: '1,0,1,0', subs: [],
    }],
  }))

  try {
	const misleadingIdentityPath = path.join(sandbox, 'misleading-inode.ts')
	fs.writeFileSync(misleadingIdentityPath, 'const differentCandidate = true\n')
	const misleadingStat = fs.statSync(misleadingIdentityPath)
	const expectedIdentityContent = 'const expectedIdentity = true\n'
	const misleadingData = {
	  script: {
		id: '10000000-0000-9000-1000-000000000033',
		path: path.join(sandbox, 'missing-identity.ts'),
		fingerprint: {
		  ...fingerprint(expectedIdentityContent),
		  device: String(misleadingStat.dev),
		  inode: String(misleadingStat.ino),
		},
		lastSeenAt: Date.now(),
	  },
	  bookmarks: [{
		id: 'misleading-bookmark', createdAt: Date.now(), label: 'Expected identity',
		path: path.join(sandbox, 'missing-identity.ts'), collapsibleState: 0, pinned: false,
		content: expectedIdentityContent.trim(), iconName: '', isInvalid: false,
		params: '0,0,0,0', subs: [],
	  }],
	}
	const misleadingNode = bookmarkRepository.createFileNode(misleadingData, misleadingData.script.path, true)
	const misleadingCandidates = await bookmarkRepository.sourceCandidateIndex([misleadingIdentityPath])
	assert.equal(await bookmarkRepository.findRelocatedSource(
	  misleadingNode,
	  misleadingData,
	  misleadingCandidates,
	), undefined)

    const workspaceRead = await bookmarkRepository.readBookmarksFromFile([sourceScript])
    assert.equal(workspaceRead.length, 2)
    const sourceNode = workspaceRead.find(node => node.scriptId === scriptId)
    const changedNode = workspaceRead.find(node => node.scriptId === changedScriptId)
    assert.ok(sourceNode)
    assert.equal(sourceNode.path, 'source.ts')
    assert.ok(changedNode)
    assert.equal(changedNode.path, 'moved/changed-name.ts')
    const changedData = JSON.parse(fs.readFileSync(changedConfigPath, 'utf8'))
    assert.equal(path.resolve(changedData.script.path), path.resolve(changedScript))
    assert.equal(changedData.script.fingerprint.size, Buffer.byteLength(currentChangedContent))
    assert.notEqual(changedData.script.fingerprint.size, Buffer.byteLength(previousChangedContent))

    workspaceFolders = undefined
    const standaloneRead = await bookmarkRepository.readBookmarksFromFile([sourceScript])
    assert.equal(standaloneRead.length, 1)
    assert.equal(standaloneRead[0].scriptId, scriptId)
    assert.equal(path.resolve(standaloneRead[0].path), path.resolve(sourceScript))

    fs.renameSync(sourceScript, renamedScript)
    const rebound = await bookmarkRepository.readBookmarksFromFile([renamedScript])
    assert.equal(rebound.length, 1)
    assert.equal(rebound[0].scriptId, scriptId)
    const renamedData = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assert.equal(path.resolve(renamedData.script.path), path.resolve(renamedScript))
    assert.equal(path.resolve(renamedData.bookmarks[0].path), path.resolve(renamedScript))

    fs.unlinkSync(renamedScript)
    await bookmarkRepository.handleFileDelete(renamedScript)
    let tombstone = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assert.equal(typeof tombstone.script.missingSince, 'number')
    assert.equal(typeof tombstone.script.fingerprint.sha256, 'string')

    // A delayed in-memory save may race with the delete event. It must retain
    // the last good source fingerprint or later create/appearance recovery has
    // no durable identity evidence left.
    assert.equal(await bookmarkRepository.saveBookmarksToFile(new BookmarkSet(rebound), [renamedScript]), true)
    tombstone = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assert.equal(typeof tombstone.script.fingerprint.sha256, 'string')

    fs.writeFileSync(renamedScript, 'const unrelatedReplacement = true\n')
    const unrelated = await bookmarkRepository.readBookmarksFromFile([renamedScript])
    assert.equal(unrelated.length, 0)
    assert.equal(fs.existsSync(configPath), true)

    fs.writeFileSync(renamedScript, content)
    const restored = await bookmarkRepository.readBookmarksFromFile([renamedScript])
    assert.equal(restored.length, 1)
    assert.equal(JSON.parse(fs.readFileSync(configPath, 'utf8')).script.missingSince, undefined)
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

const repositorySource = fs.readFileSync('src/repository/BookmarkRepository.ts', 'utf8')
assert.match(repositorySource, /MAX_SOURCE_CONTENT_CACHE_BYTES/)
assert.match(repositorySource, /candidates\.contentBytes \+ bytes > MAX_SOURCE_CONTENT_CACHE_BYTES/)
const identitySource = fs.readFileSync('src/util/ScriptIdentity.ts', 'utf8')
assert.doesNotMatch(identitySource, /fingerprintCache|CachedSourceFingerprint/)
