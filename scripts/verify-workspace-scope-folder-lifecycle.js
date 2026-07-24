/**
 * 验证空工作区作用域目录只在撤销与重做均无内容时删除。
 * 同时检查非空目录、非标准目录和受历史保护目录不会被误删。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  cleanupEmptyWorkspaceScopeFolders,
  workspaceScopeFolderPath,
} = require('../out/util/WorkspaceScopeFolderLifecycle')

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-scope-lifecycle-'))
  const storageRoot = path.join(sandbox, 'storage')
  const workspaceA = path.join(sandbox, 'workspace-a')
  const workspaceB = path.join(sandbox, 'workspace-b')
  const scopeA = workspaceScopeFolderPath(storageRoot, workspaceA)
  const scopeB = workspaceScopeFolderPath(storageRoot, workspaceB)
  const malformed = path.join(storageRoot, 'scopes', 'not-a-codebookmark-scope')
  fs.mkdirSync(scopeA, { recursive: true })
  fs.mkdirSync(scopeB, { recursive: true })
  fs.mkdirSync(malformed, { recursive: true })
  fs.writeFileSync(path.join(scopeB, 'record.json'), '{}')

  try {
    assert.equal(await cleanupEmptyWorkspaceScopeFolders(storageRoot, [`workspace:${workspaceA}`]), 0)
    assert.equal(fs.existsSync(scopeA), true, 'undo or redo history must retain the empty scope')
    assert.equal(fs.existsSync(scopeB), true, 'non-empty scopes must never be removed')
    assert.equal(fs.existsSync(malformed), true, 'unknown directories must not be treated as owned scopes')

    assert.equal(await cleanupEmptyWorkspaceScopeFolders(storageRoot, []), 1)
    assert.equal(fs.existsSync(scopeA), false)
    assert.equal(fs.existsSync(scopeB), true)
    assert.equal(fs.existsSync(malformed), true)

    fs.unlinkSync(path.join(scopeB, 'record.json'))
    assert.equal(await cleanupEmptyWorkspaceScopeFolders(storageRoot, ['file:C:\\standalone.ts']), 1)
    assert.equal(fs.existsSync(scopeB), false, 'standalone history must not retain a workspace scope')
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('Workspace scope folder lifecycle verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
