/**
 * 验证 AI 文件夹扫描的递归顺序、排除目录、源码筛选、数量限制与取消响应。
 * 脚本在临时目录中调用编译后的 `AISourceFolderScanner` 完成真实操作，检查落盘结果而不是内存假象。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  listAISourceFilesInFolder,
  visitAISourceFilesInFolder,
} = require('../out/util/AISourceFolderScanner')

async function main() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-ai-folder-'))
  try {
    fs.mkdirSync(path.join(folder, 'nested'))
    fs.mkdirSync(path.join(folder, 'node_modules'))
    fs.writeFileSync(path.join(folder, 'b.ts'), '')
    fs.writeFileSync(path.join(folder, 'a.py'), '')
    fs.writeFileSync(path.join(folder, 'notes.txt'), '')
    fs.writeFileSync(path.join(folder, 'nested', 'c.js'), '')
    fs.writeFileSync(path.join(folder, 'node_modules', 'ignored.ts'), '')

    const files = await listAISourceFilesInFolder(folder)
    assert.deepEqual(files.map(file => path.relative(folder, file)), [
      'a.py',
      'b.ts',
      path.join('nested', 'c.js'),
    ])

    const visited = []
    const stopped = await visitAISourceFilesInFolder(folder, filePath => {
      visited.push(path.relative(folder, filePath))
      return true
    })
    assert.equal(stopped, true)
    assert.deepEqual(visited, ['a.py'])

    await assert.rejects(
      () => visitAISourceFilesInFolder(folder, () => false, {
        maxFiles: 2,
        maxEntries: 100,
        maxDepth: 64,
      }),
      /脚本文件超过 2 个/,
    )
    await assert.rejects(
      () => visitAISourceFilesInFolder(folder, () => false, {
        maxFiles: 100,
        maxEntries: 1,
        maxDepth: 64,
      }),
      /扫描项超过 1 个/,
    )
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('AISourceFolderScanner contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
