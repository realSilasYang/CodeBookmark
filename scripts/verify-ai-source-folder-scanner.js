/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-source-folder-scanner`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-source-folder-scanner` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-source-folder-scanner”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
