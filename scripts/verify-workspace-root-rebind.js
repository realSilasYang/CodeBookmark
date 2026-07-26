/**
 * 模拟工作区根目录移动，验证子脚本绑定和已保存顺序整体跟随。
 * 为核对工作区根目录移动，验证子脚本绑定和已保存顺序整体跟随，脚本在临时目录中调用编译后的 `PathHash`、`BookmarkRepository` 完成真实操作，检查落盘结果而不是内存假象。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const { scriptEnvelope } = require('./test-support/bookmark-fixtures')
const { createRepositoryVscodeMock } = require('./test-support/repository-vscode-mock')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-root-rebind-'))
const storageRoot = path.join(sandbox, 'storage')
const oldRoot = path.join(sandbox, 'old-workspace')
const newRoot = path.join(sandbox, 'renamed-workspace')
const scriptFolder = path.join(storageRoot, 'scripts')
fs.mkdirSync(path.join(newRoot, 'src'), { recursive: true })
fs.mkdirSync(scriptFolder, { recursive: true })

const workspaceFolder = { uri: { scheme: 'file', fsPath: newRoot } }
const vscodeMock = createRepositoryVscodeMock({ storageRoot, workspaceFolders: [workspaceFolder] })
installModuleMocks({ vscode: vscodeMock })

const { stableWorkspacePathHash } = require('../out/util/PathHash')
const { bookmarkRepository } = require('../out/repository/BookmarkRepository')
const { cleanupEmptyWorkspaceScopeFolders } = require('../out/util/WorkspaceScopeFolderLifecycle')

function envelope(id, sourcePath, content) {
	return scriptEnvelope({ scriptId: id, sourcePath, content })
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
  const reboundOrder = JSON.parse(fs.readFileSync(path.join(newScope, '_workspace_order.json'), 'utf8'))
  assert.equal(reboundOrder.format, 'codebookmark.workspace-order')
  assert.equal(reboundOrder.schemaVersion, 1)
  assert.deepEqual(reboundOrder.order, ['src/b.ts', 'src/a.ts'])
  assert.equal(fs.existsSync(oldScope), true, 'repository cleanup waits until undo retention is known')
  assert.equal(await cleanupEmptyWorkspaceScopeFolders(storageRoot, []), 1)
  assert.equal(fs.existsSync(oldScope), false)
  assert.equal(fs.existsSync(path.join(storageRoot, '.script-relocations')), false)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
