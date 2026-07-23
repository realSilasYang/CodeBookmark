const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-directory-appearance-'))
const storageRoot = path.join(sandbox, 'storage')
const workspaceRoot = path.join(sandbox, 'workspace')
const oldDirectory = path.join(workspaceRoot, 'src', 'before')
const newDirectory = path.join(workspaceRoot, 'src', 'after')
const scriptFolder = path.join(storageRoot, 'scripts')
fs.mkdirSync(oldDirectory, { recursive: true })
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
const workspaceFolder = { uri: { scheme: 'file', fsPath: workspaceRoot } }
const vscodeMock = {
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {}, ThemeColor: class {}, MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    workspaceFolders: [workspaceFolder], textDocuments: [],
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
const { BookmarkSet } = require('../out/models/BookmarkSet')

function envelope(id, scriptPath, content) {
  return {
    script: {
      id,
      path: scriptPath,
      fingerprint: {
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        size: Buffer.byteLength(content),
      },
      lastSeenAt: Date.now(),
    },
    bookmarks: [{
      id: `bookmark-${id}`,
      createdAt: Date.now(),
      label: path.basename(scriptPath),
      path: scriptPath,
      collapsibleState: 0,
      pinned: false,
      content: content.trim(),
      iconName: '',
      isInvalid: false,
      params: '0,0,0,0',
      subs: [],
    }],
  }
}

async function main() {
  try {
    const ids = [
      '10000000-0000-9000-1000-000000000071',
      '10000000-0000-9000-1000-000000000072',
    ]
    for (let index = 0; index < ids.length; index++) {
      const name = `${index}.ts`
      const content = `const directoryMove${index} = true\n`
      const sourcePath = path.join(oldDirectory, name)
      fs.writeFileSync(sourcePath, content)
      fs.writeFileSync(path.join(scriptFolder, `${ids[index]}.json`), JSON.stringify(envelope(ids[index], sourcePath, content)))
    }
    const excludedId = '10000000-0000-9000-1000-000000000073'
    const excludedContent = 'const generatedCopyMustNotRebind = true\n'
    const missingSource = path.join(workspaceRoot, 'src', 'missing.ts')
    fs.writeFileSync(
      path.join(scriptFolder, `${excludedId}.json`),
      JSON.stringify(envelope(excludedId, missingSource, excludedContent)),
    )
    const scope = path.join(storageRoot, 'scopes', `${path.basename(workspaceRoot)}_${stableWorkspacePathHash(workspaceRoot)}`)
    fs.mkdirSync(scope, { recursive: true })
    fs.writeFileSync(path.join(scope, '_workspace_order.json'), JSON.stringify([
      'src/before/1.ts',
      'src/before/0.ts',
    ]))
	const staleNodes = await bookmarkRepository.readBookmarksFromFile([path.join(oldDirectory, '0.ts')])

    fs.renameSync(oldDirectory, newDirectory)
    const changes = await bookmarkRepository.handleFileAppearance(newDirectory)
    assert.deepEqual(changes.map(change => change.scriptId).sort(), ids)
    for (let index = 0; index < ids.length; index++) {
      const expectedPath = path.join(newDirectory, `${index}.ts`)
      const data = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${ids[index]}.json`), 'utf8'))
      assert.equal(path.resolve(data.script.path), path.resolve(expectedPath))
      assert.equal(path.resolve(data.bookmarks[0].path), path.resolve(expectedPath))
    }
    const migratedOrder = JSON.parse(fs.readFileSync(path.join(scope, '_workspace_order.json'), 'utf8'))
    assert.equal(migratedOrder.format, 'codebookmark.workspace-order')
    assert.equal(migratedOrder.schemaVersion, 1)
    assert.deepEqual(migratedOrder.order, [
      'src/after/1.ts',
      'src/after/0.ts',
    ])
	assert.equal(await bookmarkRepository.saveBookmarksToFile(
	  new BookmarkSet(staleNodes),
	  [path.join(oldDirectory, '0.ts')],
	), true)
	const reboundAfterStaleSave = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${ids[0]}.json`), 'utf8'))
	assert.equal(path.resolve(reboundAfterStaleSave.script.path), path.resolve(path.join(newDirectory, '0.ts')))

    const generatedCopy = path.join(workspaceRoot, 'dist', 'missing.js')
    fs.mkdirSync(path.dirname(generatedCopy), { recursive: true })
    fs.writeFileSync(generatedCopy, excludedContent)
    assert.deepEqual(await bookmarkRepository.handleFileAppearance(generatedCopy), [])
    const excludedData = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${excludedId}.json`), 'utf8'))
    assert.equal(path.resolve(excludedData.script.path), path.resolve(missingSource))

	const ambiguousContent = 'const ambiguousMove = true\n'
	const ambiguousTarget = path.join(workspaceRoot, 'src', 'ambiguous.ts')
	const ambiguousIds = [
	  '10000000-0000-9000-1000-000000000074',
	  '10000000-0000-9000-1000-000000000075',
	]
	for (const [index, id] of ambiguousIds.entries()) {
	  fs.writeFileSync(
		path.join(scriptFolder, `${id}.json`),
		JSON.stringify(envelope(id, path.join(workspaceRoot, 'missing', `${index}.ts`), ambiguousContent)),
	  )
	}
	fs.writeFileSync(ambiguousTarget, ambiguousContent)
	bookmarkRepository.indexReady = false
	assert.deepEqual(await bookmarkRepository.handleFileAppearance(ambiguousTarget), [])
	for (const [index, id] of ambiguousIds.entries()) {
	  const data = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${id}.json`), 'utf8'))
	  assert.equal(path.resolve(data.script.path), path.resolve(path.join(workspaceRoot, 'missing', `${index}.ts`)))
	}

	const occupiedId = '10000000-0000-9000-1000-000000000076'
	const occupiedContent = 'const originalMovedFile = true\n'
	const occupiedOldPath = path.join(workspaceRoot, 'src', 'occupied.ts')
	const occupiedNewPath = path.join(workspaceRoot, 'src', 'moved-from-occupied.ts')
	fs.writeFileSync(occupiedOldPath, occupiedContent)
	fs.writeFileSync(path.join(scriptFolder, `${occupiedId}.json`), JSON.stringify(envelope(occupiedId, occupiedOldPath, occupiedContent)))
	fs.renameSync(occupiedOldPath, occupiedNewPath)
	fs.writeFileSync(occupiedOldPath, 'const unrelatedReplacement = true\n')
	bookmarkRepository.indexReady = false
	const occupiedChanges = await bookmarkRepository.handleFileAppearance(occupiedNewPath)
	assert.deepEqual(occupiedChanges.map(change => change.scriptId), [occupiedId])
	const occupiedData = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${occupiedId}.json`), 'utf8'))
	assert.equal(path.resolve(occupiedData.script.path), path.resolve(occupiedNewPath))
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
