/**
 * 模拟未完成迁移事务，验证启动恢复能够继续、回滚或保留无法判断的日志。
 * 脚本在临时目录中调用编译后的 `PathHash`、`ScriptRelocationJournal`、`BookmarkRepository` 完成真实操作，检查落盘结果而不是内存假象。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const { scriptEnvelope } = require('./test-support/bookmark-fixtures')
const { createRepositoryVscodeMock } = require('./test-support/repository-vscode-mock')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-relocation-recovery-'))
const storageRoot = path.join(sandbox, 'storage')
const sourceWorkspace = path.join(sandbox, 'source-workspace')
const targetWorkspace = path.join(sandbox, 'target-workspace')
const scriptFolder = path.join(storageRoot, 'scripts')
fs.mkdirSync(scriptFolder, { recursive: true })
fs.mkdirSync(targetWorkspace, { recursive: true })

const workspaceFolder = { uri: { scheme: 'file', fsPath: targetWorkspace } }
const vscodeMock = createRepositoryVscodeMock({ storageRoot, workspaceFolders: [workspaceFolder] })

installModuleMocks({ vscode: vscodeMock })

const { stableWorkspacePathHash } = require('../out/util/PathHash')
const { createScriptRelocation } = require('../out/repository/ScriptRelocationJournal')
const { bookmarkRepository } = require('../out/repository/BookmarkRepository')

function envelope(id, scriptPath, content, bookmarkId) {
	return scriptEnvelope({ scriptId: id, sourcePath: scriptPath, content, bookmarkId, label: bookmarkId })
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
  const pendingRelocation = await createScriptRelocation(storageRoot, {
    oldAbsolutePath: sourceDirectory,
    newAbsolutePath: targetDirectory,
    oldBookmarkFolder: sourceScope,
    newBookmarkFolder: targetScope,
    oldBookmarkPath: 'src/source',
    newBookmarkPath: 'src/target',
  })
  const legacyJournal = JSON.parse(fs.readFileSync(pendingRelocation.journalPath, 'utf8'))
  delete legacyJournal.format
  delete legacyJournal.schemaVersion
  fs.writeFileSync(pendingRelocation.journalPath, JSON.stringify(legacyJournal))

  const loaded = await bookmarkRepository.readBookmarksFromFile([targetA])
  assert.deepEqual(loaded.map(node => node.scriptId).sort(), [idA, idB])
  const recoveredB = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${idB}.json`), 'utf8'))
  assert.equal(path.resolve(recoveredB.script.path), path.resolve(targetB))
  assert.equal(path.resolve(recoveredB.bookmarks[0].path), path.resolve(targetB))
  const recoveredOrder = JSON.parse(fs.readFileSync(path.join(targetScope, '_workspace_order.json'), 'utf8'))
  assert.equal(recoveredOrder.format, 'codebookmark.workspace-order')
  assert.equal(recoveredOrder.schemaVersion, 1)
  assert.deepEqual(recoveredOrder.order, [
    'src/target/a.ts',
    'src/target/b.ts',
  ])
  assert.equal(fs.existsSync(path.join(storageRoot, '.script-relocations')), false)
  assert.equal(fs.existsSync(`${pendingRelocation.journalPath}.migration-v0.backup`), false)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
