/**
 * 以真实 `.codebookmark` 归档和临时源码验证导入编排：模式识别、冲突隔离、取消零写入与逆序回滚。
 * VS Code 仅在 API 边界替换，归档读取、源码匹配和交换记录落盘均使用生产实现。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createPortableArchive } = require('../out/portable/PortableArchive')
const { installModuleMocks } = require('./test-support/module-mocks')

const ROOT_ID = 'root-1'
const EXCHANGE_ID = '30000000-0000-4000-8000-000000000001'
const REVISION_ID = '40000000-0000-4000-8000-000000000001'

function uri(filePath) {
  return { scheme: 'file', fsPath: path.resolve(filePath) }
}

function bookmark(id, label) {
  return {
    id, createdAt: 1_700_000_000_000, label, collapsibleState: 0,
    pinned: false, iconName: '', isInvalid: false, subs: [], params: '0,0,0,1',
  }
}

function portableScript(scriptId, bookmarkId, label) {
  return {
    format: 'codebookmark.portable-script', schemaVersion: 1, scriptId,
    bookmarks: [bookmark(bookmarkId, label)],
  }
}

function writePackage(folder, scope, scripts) {
  const packagePath = path.join(folder, `${scope}.codebookmark`)
  const archive = createPortableArchive({
    format: 'codebookmark.portable-package', schemaVersion: 1,
    exchangeId: EXCHANGE_ID, revisionId: REVISION_ID, parentRevisionIds: [],
    createdAt: 1_700_000_000_000, title: 'Import workflow', scope,
    roots: [{ id: ROOT_ID, name: path.basename(folder) }],
  }, scripts.map(script => ({
    index: {
      scriptId: script.value.scriptId, rootId: ROOT_ID,
      relativePath: script.relativePath, entry: `scripts/${script.value.scriptId}.json`,
    },
    value: script.value,
  })))
  fs.writeFileSync(packagePath, Buffer.from(archive))
  return packagePath
}

function workspaceFolder(root) {
  return { name: path.basename(root), uri: uri(root) }
}

function createPort(storageRoot, state, options = {}) {
  const calls = { ensured: [], imported: [], modes: [], rollbacks: [], committed: 0, refreshed: [], transactions: 0 }
  return {
    calls,
    port: {
      storageRoot: () => storageRoot,
      ensureScope: async target => { calls.ensured.push(target.fsPath) },
      storageScopeForUri: target => {
        const folder = state.workspaceFolders.find(candidate => {
          const relative = path.relative(candidate.uri.fsPath, target.fsPath)
          return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
        })
        return folder ? `workspace:${path.resolve(folder.uri.fsPath)}` : `file:${path.resolve(target.fsPath)}`
      },
      flushPendingSaves: async () => {},
      runImportTransaction: async operation => { calls.transactions++; return operation() },
      captureUndoState: () => ({ scope: 'test' }),
      commitImportUndo: () => { calls.committed++ },
      targetHasBookmarks: async target => options.bookmarkedTargets?.has(path.resolve(target)) ?? false,
      importScript: async (portable, target, _base, _previousScriptId, _mappings, mode) => {
        calls.imported.push(path.resolve(target))
        calls.modes.push(mode)
        if (options.failScriptId === portable.scriptId) throw new Error('synthetic second-script failure')
        const rollback = async () => { calls.rollbacks.push(portable.scriptId) }
        return {
          localScriptId: portable.scriptId,
          bookmarkMappings: Object.fromEntries(portable.bookmarks.map(item => [item.id, item.id])),
          fileNode: { subs: { values: [] } },
          updated: 1, removed: 0, conflicts: 0, rollback,
        }
      },
      importLayout: async () => async () => { calls.rollbacks.push('layout') },
      refresh: async scope => { calls.refreshed.push(scope) },
    },
  }
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-portable-workflow-'))
  const state = {
    packagePath: '', activePath: undefined, workspaceFolders: [], quickPickMode: 'append',
    messages: [], warnings: [],
  }
  const vscode = {
    Uri: { file: uri },
    window: {
      get activeTextEditor() {
        return state.activePath ? { document: { uri: uri(state.activePath) } } : undefined
      },
      showOpenDialog: async () => state.packagePath ? [uri(state.packagePath)] : undefined,
      showQuickPick: async items => state.quickPickMode
        ? items.find(item => item.mode === state.quickPickMode)
        : undefined,
      showInformationMessage: message => { state.messages.push(message) },
      showWarningMessage: message => { state.warnings.push(message) },
    },
    workspace: {
      get workspaceFolders() { return state.workspaceFolders },
      getWorkspaceFolder: target => state.workspaceFolders.find(folder => {
        const relative = path.relative(folder.uri.fsPath, target.fsPath)
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
      }),
    },
  }
  const restore = installModuleMocks({ vscode })
  try {
    const { runPortablePackageImport } = require('../out/providers/PortableImportWorkflowRunner')

    state.workspaceFolders = []
    state.activePath = undefined
    state.packagePath = path.join(sandbox, 'missing.codebookmark')
    const missing = createPort(path.join(sandbox, 'missing-storage'), state)
    await assert.rejects(
      runPortablePackageImport(missing.port),
      error => error instanceof Error && !/ENOENT|no such file/iu.test(error.message),
    )
    assert.equal(missing.calls.transactions, 0)

    state.packagePath = path.join(sandbox, 'damaged.codebookmark')
    fs.writeFileSync(state.packagePath, 'not a zip archive')
    const damaged = createPort(path.join(sandbox, 'damaged-storage'), state)
    await assert.rejects(
      runPortablePackageImport(damaged.port),
      error => error instanceof Error && !/ZIP|archive|归档/iu.test(error.message),
    )
    assert.equal(damaged.calls.transactions, 0)

    const singleFolder = path.join(sandbox, 'single')
    const singleStorage = path.join(sandbox, 'single-storage')
    const activeScript = path.join(singleFolder, 'renamed.ts')
    fs.mkdirSync(singleFolder, { recursive: true })
    fs.writeFileSync(activeScript, 'export const active = true\n')
    state.workspaceFolders = []
    state.activePath = activeScript
    state.packagePath = writePackage(singleFolder, 'script', [{
      relativePath: 'original.ts',
      value: portableScript('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Single'),
    }])
    const single = createPort(singleStorage, state)
    await runPortablePackageImport(single.port)
    assert.deepEqual(single.calls.imported, [path.resolve(activeScript)])
    assert.deepEqual(single.calls.modes, ['append'])
    assert.equal(single.calls.committed, 1)
    assert.equal(fs.readdirSync(path.join(singleStorage, 'exchanges')).length, 1)

    const workspaceRoot = path.join(sandbox, 'workspace')
    const workspaceStorage = path.join(sandbox, 'workspace-storage')
    const first = path.join(workspaceRoot, 'src', 'first.ts')
    const second = path.join(workspaceRoot, 'src', 'second.ts')
    fs.mkdirSync(path.dirname(first), { recursive: true })
    fs.writeFileSync(first, 'export const first = true\n')
    fs.writeFileSync(second, 'export const second = true\n')
    state.workspaceFolders = [workspaceFolder(workspaceRoot)]
    state.activePath = first
    state.quickPickMode = 'overwrite'
    state.packagePath = writePackage(workspaceRoot, 'workspace', [
      { relativePath: 'src/first.ts', value: portableScript('10000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011', 'First') },
      { relativePath: 'src/second.ts', value: portableScript('10000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012', 'Second') },
    ])
    const workspace = createPort(workspaceStorage, state, { bookmarkedTargets: new Set([path.resolve(second)]) })
    await runPortablePackageImport(workspace.port)
    assert.deepEqual(workspace.calls.imported, [path.resolve(first), path.resolve(second)])
    assert.deepEqual(workspace.calls.modes, ['overwrite', 'overwrite'])
    assert.equal(workspace.calls.committed, 1)

    state.quickPickMode = undefined
    const cancelledStorage = path.join(sandbox, 'cancelled-storage')
    const cancelled = createPort(cancelledStorage, state, { bookmarkedTargets: new Set([path.resolve(first)]) })
    await runPortablePackageImport(cancelled.port)
    assert.equal(cancelled.calls.transactions, 0)
    assert.equal(cancelled.calls.imported.length, 0)
    assert.equal(fs.existsSync(path.join(cancelledStorage, 'exchanges')), false)

    state.quickPickMode = 'append'
    fs.rmSync(second)
    const partialStorage = path.join(sandbox, 'partial-storage')
    const partial = createPort(partialStorage, state)
    const warningsBefore = state.warnings.length
    await runPortablePackageImport(partial.port)
    assert.deepEqual(partial.calls.imported, [path.resolve(first)])
    assert.equal(state.warnings.length, warningsBefore + 1)
    assert.match(state.warnings.at(-1), /1/)
    const partialExchangeName = fs.readdirSync(path.join(partialStorage, 'exchanges'))[0]
    const partialExchange = JSON.parse(fs.readFileSync(path.join(partialStorage, 'exchanges', partialExchangeName), 'utf8'))
    assert.deepEqual(partialExchange.baseScripts.map(script => script.scriptId), ['10000000-0000-4000-8000-000000000011'])

    fs.writeFileSync(second, 'export const second = true\n')
    const failedStorage = path.join(sandbox, 'failed-storage')
    const failedScriptId = '10000000-0000-4000-8000-000000000012'
    const failed = createPort(failedStorage, state, { failScriptId: failedScriptId })
    await assert.rejects(runPortablePackageImport(failed.port), /synthetic second-script failure/)
    assert.deepEqual(failed.calls.imported, [path.resolve(first), path.resolve(second)])
    assert.deepEqual(failed.calls.rollbacks, ['10000000-0000-4000-8000-000000000011'])
    assert.equal(failed.calls.committed, 0)
    assert.equal(fs.existsSync(path.join(failedStorage, 'exchanges')), false)
  } finally {
    restore()
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('Portable import workflow verified.'),
  error => { console.error(error); process.exitCode = 1 },
)
