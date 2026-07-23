/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-source-snapshot`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-source-snapshot` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-source-snapshot”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { installModuleMocks } = require('./test-support/module-mocks')

const restoreModules = installModuleMocks({
  vscode: {
    window: {
      showWarningMessage: async (_message, _options, continueLabel) => continueLabel,
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    },
    workspace: {
      getConfiguration: () => ({ get: () => undefined }),
    },
  },
})

const {
  assertAIDocumentSnapshot,
  assertAISourceSnapshot,
  readAISourceSnapshot,
} = require('../out/util/AISourceSnapshot')
restoreModules()

async function main() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-ai-source-'))
  const diskFile = path.join(folder, 'source.ts')
  try {
    fs.writeFileSync(diskFile, 'const value = 1\n', 'utf8')
    const diskSnapshot = await readAISourceSnapshot(diskFile, () => undefined)
    assert.equal(diskSnapshot.kind, 'disk')
    assert.equal(diskSnapshot.content, 'const value = 1\n')
    await assertAISourceSnapshot(diskFile, diskSnapshot)

    const document = {
      uri: { fsPath: diskFile },
      version: 7,
      getText: () => 'const openValue = 2\n',
    }
    const documentSnapshot = await readAISourceSnapshot(diskFile, () => document)
    assert.equal(documentSnapshot.kind, 'document')
    assert.equal(documentSnapshot.version, 7)
    assertAIDocumentSnapshot(document, 7, 'const openValue = 2\n', diskFile)
    document.version = 8
    assert.throws(
      () => assertAIDocumentSnapshot(document, 7, 'const openValue = 2\n', diskFile),
      /源文件发生变化/,
    )

    fs.writeFileSync(diskFile, 'const value = 3\n', 'utf8')
    await assert.rejects(() => assertAISourceSnapshot(diskFile, diskSnapshot), /源文件发生变化/)

    fs.writeFileSync(diskFile, 'binary\0content', 'utf8')
    await assert.rejects(() => readAISourceSnapshot(diskFile, () => undefined), /二进制内容/)
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('AISourceSnapshot contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
