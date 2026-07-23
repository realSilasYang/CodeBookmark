/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bookmark-import`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bookmark-import` 对应契约。
 * 核心边界：通过断言锁定“verify-bookmark-import”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`、`worker`、`main`、`worker`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-import-'))
const storageRoot = path.join(sandbox, 'storage')
const scriptFolder = path.join(storageRoot, 'scripts')
const workspaceRoot = path.join(sandbox, 'workspace')
fs.mkdirSync(scriptFolder, { recursive: true })
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
class Position {
  constructor(line, character) {
    this.line = line
    this.character = character
  }
}
class Selection {
  constructor(start, end) {
    this.start = start
    this.end = end
  }
}
const textDocuments = []
function textDocument(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r\n|\n|\r/)
  const offsets = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }
  return {
    uri: { scheme: 'file', fsPath: filePath },
    version: 1,
    languageId: 'typescript',
    lineCount: lines.length,
    lineAt: line => ({ text: lines[line] }),
    getText: selection => {
      if (!selection) return content
      const start = offsets[selection.start.line] + selection.start.character
      const end = offsets[selection.end.line] + selection.end.character
      return content.slice(start, end)
    },
    offsetAt: position => offsets[position.line] + position.character,
    positionAt: value => {
      let line = 0
      while (line + 1 < offsets.length && offsets[line + 1] <= value) line++
      return new Position(line, value - offsets[line])
    },
  }
}
const vscodeMock = {
  TreeItem,
  Position,
  Selection,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {},
  ThemeColor: class {},
  MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    workspaceFolders: [{ name: 'workspace', uri: { scheme: 'file', fsPath: workspaceRoot } }],
    textDocuments,
    openTextDocument: async uri => {
      const document = textDocument(uri.fsPath)
      textDocuments.push(document)
      return document
    },
    getWorkspaceFolder: uri => {
      if (!uri?.fsPath) return undefined
      const relative = path.relative(workspaceRoot, uri.fsPath)
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
        ? { name: 'workspace', uri: { scheme: 'file', fsPath: workspaceRoot } }
        : undefined
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
		showWarningMessage: async (_message, _options, continueLabel) => continueLabel,
    showInformationMessage: async () => undefined,
    showQuickPick: async items => items[0],
  },
  commands: { executeCommand: async () => undefined },
}
installModuleMocks({ vscode: vscodeMock })

const { bookmarkRepository } = require('../out/repository/BookmarkRepository')

function sourceFingerprint(content) {
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    size: Buffer.byteLength(content),
  }
}

function envelope(id, scriptPath, content, bookmarkId) {
  return {
    script: { id, path: scriptPath, fingerprint: sourceFingerprint(content), lastSeenAt: Date.now() },
    bookmarks: [{
      id: bookmarkId, createdAt: Date.now(), label: 'Imported bookmark', path: scriptPath,
      collapsibleState: 0, pinned: false, content: content.trim(), iconName: '',
      isInvalid: false, params: '0,0,0,0', subs: [],
    }],
  }
}

async function main() {
  const content = 'const imported = true\n'
  const target = path.join(sandbox, 'target.ts')
  const other = path.join(sandbox, 'other.ts')
  const importPath = path.join(sandbox, 'selected-config.json')
  fs.writeFileSync(target, content)
  fs.writeFileSync(other, content)
  const sharedId = '10000000-0000-9000-1000-000000000041'
  fs.writeFileSync(path.join(scriptFolder, `${sharedId}.json`), JSON.stringify(envelope(sharedId, other, content, 'existing')))
  fs.writeFileSync(importPath, JSON.stringify(envelope(sharedId, path.join(sandbox, 'original.ts'), content, 'imported')))

  const imported = await bookmarkRepository.importBookmarkConfiguration(importPath, target)
  assert.equal(path.resolve(imported.path), path.resolve(target))
  assert.notEqual(imported.scriptId, sharedId)
  const outputPath = path.join(scriptFolder, `${imported.scriptId}.json`)
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  assert.equal(Object.hasOwn(output, 'version'), false)
  assert.equal(path.resolve(output.script.path), path.resolve(target))
  assert.equal(path.resolve(output.bookmarks[0].path), path.resolve(target))
  assert.notEqual(output.bookmarks[0].id, 'imported')

  const mergeTarget = path.join(sandbox, 'merge-target.ts')
  const mergeExistingId = '10000000-0000-9000-0000-000000000046'
  const mergeImportedId = '10000000-0000-9000-0000-000000000047'
  const mergeContent = 'const merged = true\n'
  const mergeChild = (id, label, scriptPath) => ({
    id, createdAt: 1, label, path: scriptPath, collapsibleState: 0,
    pinned: false, content: 'child', iconName: '', isInvalid: false, params: '0,0,0,0', subs: [],
  })
  const mergeBookmark = (id, label, scriptPath, subs = []) => ({
    id, createdAt: 1, label, path: scriptPath, collapsibleState: 0,
    pinned: false, content: mergeContent.trim(), iconName: '', isInvalid: false, params: '0,0,0,0', subs,
  })
  const mergeExistingPath = path.join(scriptFolder, `${mergeExistingId}.json`)
  const mergeImportPath = path.join(sandbox, 'merge-import.json')
  fs.writeFileSync(mergeTarget, mergeContent)
  fs.writeFileSync(mergeExistingPath, JSON.stringify({
    script: { id: mergeExistingId, path: mergeTarget, fingerprint: sourceFingerprint(mergeContent), lastSeenAt: 1 },
    bookmarks: [
      mergeBookmark('existing-duplicate', 'Same bookmark', mergeTarget),
      mergeBookmark('merge-conflict', 'Existing conflict', mergeTarget, [mergeChild('existing-child', 'Existing child', mergeTarget)]),
    ],
  }))
  fs.writeFileSync(mergeImportPath, JSON.stringify({
    script: { id: mergeImportedId, path: path.join(sandbox, 'old-merge-target.ts'), fingerprint: sourceFingerprint(mergeContent), lastSeenAt: 2 },
    bookmarks: [
      mergeBookmark('imported-duplicate', 'Same bookmark', path.join(sandbox, 'old-merge-target.ts')),
      mergeBookmark('merge-conflict', 'Imported conflict', path.join(sandbox, 'old-merge-target.ts'), [mergeChild('imported-child', 'Imported child', path.join(sandbox, 'old-merge-target.ts'))]),
      mergeBookmark('imported-unique', 'Imported unique', path.join(sandbox, 'old-merge-target.ts')),
    ],
  }))
  bookmarkRepository.indexReady = false
  await bookmarkRepository.importBookmarkConfiguration(mergeImportPath, mergeTarget, true)
  const mergedOutput = JSON.parse(fs.readFileSync(mergeExistingPath, 'utf8'))
  assert.equal(mergedOutput.script.id, mergeExistingId)
  assert.equal(mergedOutput.bookmarks.length, 4)
  assert.equal(mergedOutput.bookmarks.some(item => item.id === 'imported-duplicate'), false)
  assert.equal(mergedOutput.bookmarks.some(item => item.label === 'Imported conflict'), true)
  assert.equal(mergedOutput.bookmarks.some(item => item.id === 'imported-unique'), true)
  const mergedIds = []
  const collectMergedIds = items => {
    for (const item of items) {
      mergedIds.push(item.id)
      collectMergedIds(item.subs ?? [])
      assert.equal(path.resolve(item.path), path.resolve(mergeTarget))
    }
  }
  collectMergedIds(mergedOutput.bookmarks)
  assert.equal(new Set(mergedIds).size, mergedIds.length)

  const exportedFolder = path.join(sandbox, 'exported-configs')
  const nestedSource = path.join(workspaceRoot, 'src', 'nested', 'worker.js')
  const rootSource = path.join(workspaceRoot, 'src', 'main.ts')
  fs.mkdirSync(path.dirname(nestedSource), { recursive: true })
  fs.writeFileSync(rootSource, 'export const main = true\n')
  fs.writeFileSync(nestedSource, 'export const worker = true\n')
  fs.mkdirSync(path.join(exportedFolder, 'src', 'nested'), { recursive: true })
  const rootConfig = path.join(exportedFolder, 'src', 'main.ts.codebookmark.json')
  const nestedConfig = path.join(exportedFolder, 'src', 'nested', 'worker.js.codebookmark.json')
	fs.writeFileSync(rootConfig, JSON.stringify(envelope(
		'10000000-0000-9000-1000-000000000043',
		path.join(sandbox, 'old-workspace', 'src', 'main.ts'),
		'export const main = true\n',
		'folder-main',
	)))
  fs.writeFileSync(nestedConfig, JSON.stringify(envelope(
    '10000000-0000-9000-1000-000000000044',
    path.join(sandbox, 'old-workspace', 'src', 'nested', 'worker.js'),
    'export const worker = true\n',
    'folder-worker',
  )))
  fs.writeFileSync(path.join(exportedFolder, 'README.json'), '{}')

	const folderResult = await bookmarkRepository.importBookmarkConfigurationsFromFolder(exportedFolder, workspaceRoot)
	assert.deepEqual(folderResult, {
		total: 2,
		imported: 2,
		skipped: 0,
		failed: 0,
		cancelled: false,
		bookmarkSummary: { total: 2, levelCounts: [2] },
	})
  const storedEnvelopes = fs.readdirSync(scriptFolder)
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(fs.readFileSync(path.join(scriptFolder, file), 'utf8')))
  const importedPaths = new Set(storedEnvelopes.map(value => path.resolve(value.script.path)))
  assert.equal(importedPaths.has(path.resolve(rootSource)), true)
  assert.equal(importedPaths.has(path.resolve(nestedSource)), true)
  const scopeFiles = []
  const walkScopes = directory => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) walkScopes(fullPath)
      else if (entry.name === '_workspace_order.json') scopeFiles.push(fullPath)
    }
  }
  walkScopes(path.join(storageRoot, 'scopes'))
  assert.equal(scopeFiles.length, 1)

  const rawScriptsFolder = path.join(sandbox, 'raw-scripts')
  fs.mkdirSync(rawScriptsFolder, { recursive: true })
  fs.writeFileSync(path.join(rawScriptsFolder, '10000000-0000-9000-1000-000000000045.json'), JSON.stringify(envelope(
    '10000000-0000-9000-1000-000000000045',
    rootSource,
    'export const main = true\n',
    'raw-script',
  )))
  const rawFolderResult = await bookmarkRepository.importBookmarkConfigurationsFromFolder(rawScriptsFolder, workspaceRoot)
  assert.equal(rawFolderResult.imported, 1)
  assert.equal(rawFolderResult.total, 1)
  assert.deepEqual(rawFolderResult.bookmarkSummary, { total: 2, levelCounts: [2] })

  const relocatedTarget = path.join(workspaceRoot, 'src', 'relocated.ts')
  const relocatedConfig = path.join(sandbox, 'relocated-import.json')
  const relocatedId = '10000000-0000-9000-1000-000000000048'
  fs.writeFileSync(relocatedTarget, 'const header = true\nconst relocatedAnchor = true\n')
  fs.writeFileSync(relocatedConfig, JSON.stringify({
    script: {
      id: relocatedId,
      path: path.join(sandbox, 'old-relocated.ts'),
      fingerprint: sourceFingerprint('const relocatedAnchor = true\n'),
      lastSeenAt: Date.now(),
    },
    bookmarks: [{
      id: 'relocated-bookmark', createdAt: Date.now(), label: 'Relocated import',
      path: path.join(sandbox, 'old-relocated.ts'), collapsibleState: 0, pinned: false,
      content: 'const relocatedAnchor = true', iconName: '', isInvalid: false,
      params: '0,0,0,0', subs: [],
    }],
  }))
  await bookmarkRepository.importBookmarkConfiguration(relocatedConfig, relocatedTarget)
  const relocatedOutput = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${relocatedId}.json`), 'utf8'))
  assert.equal(relocatedOutput.bookmarks[0].params, '1,0,1,28')
  assert.equal(relocatedOutput.bookmarks[0].isInvalid, false)

  const malformed = path.join(sandbox, 'malformed.json')
  fs.writeFileSync(malformed, JSON.stringify(envelope(
    '10000000-0000-9000-1000-000000000042',
    'relative.ts',
    content,
    'bad',
  )))
  await assert.rejects(bookmarkRepository.importBookmarkConfiguration(malformed, target), /有效的书签配置/)

}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
