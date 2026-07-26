/**
 * 验证覆盖导入工作区布局时，不在包内的本机子树不会保留指向已删除书签的悬空父引用。
 * 测试使用真实临时持久化文件并再次走严格解码器，确保修复后的布局可在下次启动正常读取。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')

const scriptA = '10000000-0000-4000-8000-000000000031'
const scriptB = '10000000-0000-4000-8000-000000000032'
const oldBookmarkA = '20000000-0000-4000-8000-000000000031'
const fileA = { kind: 'script', scriptId: scriptA }
const fileB = { kind: 'script', scriptId: scriptB }
const bookmarkA = { kind: 'bookmark', scriptId: scriptA, bookmarkId: oldBookmarkA }

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-portable-layout-'))
  const workspaceRoot = path.join(sandbox, 'workspace')
  const storageRoot = path.join(sandbox, 'storage')
  fs.mkdirSync(workspaceRoot, { recursive: true })
  const { vscode } = createVscodeFake()
  const restore = installModuleMocks({ vscode })
  try {
    const { workspaceLayoutPersistence, decodeWorkspaceLayoutPersistence } = require('../out/models/WorkspaceLayout')
    const { fileUtils } = require('../out/util/FileUtils')
    const { importPortableWorkspaceLayout } = require('../out/repository/WorkspaceLayoutRepository')
    const scopeFolder = fileUtils.getWorkspaceBookmarkFolder(workspaceRoot, storageRoot)
    fs.mkdirSync(scopeFolder, { recursive: true })
    const layoutPath = path.join(scopeFolder, '_workspace_layout.json')
    fs.writeFileSync(layoutPath, JSON.stringify(workspaceLayoutPersistence([
      { node: fileA, parent: null },
      { node: bookmarkA, parent: fileA },
      { node: fileB, parent: bookmarkA },
    ], [], null, 1, [])))

    const imported = workspaceLayoutPersistence([{ node: fileA, parent: null }], [], null, 2, [])
    await importPortableWorkspaceLayout(
      imported,
      workspaceRoot,
      new Map([[scriptA, { scriptId: scriptA, bookmarkIds: new Map() }]]),
      storageRoot,
      'overwrite',
    )
    const decoded = decodeWorkspaceLayoutPersistence(JSON.parse(fs.readFileSync(layoutPath, 'utf8'))).layout
    assert.deepEqual(decoded.entries, [
      { node: fileB, parent: null },
      { node: fileA, parent: null },
    ])
  } finally {
    restore()
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('Portable workspace layout merge verified.'),
  error => { console.error(error); process.exitCode = 1 },
)
