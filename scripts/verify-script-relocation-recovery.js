/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-script-relocation-recovery`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-script-relocation-recovery` 对应契约。
 * 核心边界：通过断言锁定“verify-script-relocation-recovery”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  createScriptRelocation,
  readPendingScriptRelocations,
} = require('../out/repository/ScriptRelocationJournal')
const { recoverScriptRelocations } = require('../out/repository/ScriptRelocationRecovery')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-relocation-recovery-contract-'))
const storageRoot = path.join(sandbox, 'storage')

const relocation = (name, oldBookmarkPath, newBookmarkPath) => ({
  oldAbsolutePath: path.join(sandbox, `${name}-old`),
  newAbsolutePath: path.join(sandbox, `${name}-new`),
  oldBookmarkFolder: path.join(storageRoot, 'scopes', `${name}-old`),
  newBookmarkFolder: path.join(storageRoot, 'scopes', `${name}-new`),
  oldBookmarkPath,
  newBookmarkPath,
})

async function main() {
  const reverse = relocation('reverse', 'src/reverse-old', 'src/reverse-new')
  const forward = relocation('forward', 'src/forward-old', 'src/forward-new')
  await createScriptRelocation(storageRoot, reverse)
  await createScriptRelocation(storageRoot, forward)

  const performed = []
  const failures = []
  let cancellationChecks = 0
  await recoverScriptRelocations(storageRoot, {
    checkCancelled: () => { cancellationChecks++ },
    pathExists: async filePath => filePath === reverse.oldAbsolutePath || filePath === forward.newAbsolutePath,
    perform: async record => {
      performed.push(record)
      if (record.oldAbsolutePath === forward.oldAbsolutePath) throw new Error('expected perform failure')
    },
    reportFailure: (record, error) => failures.push({ record, error }),
  })

  const reversedOperation = performed.find(record => record.newAbsolutePath === reverse.oldAbsolutePath)
  assert.ok(reversedOperation)
  assert.equal(reversedOperation.oldAbsolutePath, reverse.newAbsolutePath)
  assert.equal(reversedOperation.oldBookmarkPath, reverse.newBookmarkPath)
  assert.equal(reversedOperation.newBookmarkPath, reverse.oldBookmarkPath)
  const forwardOperation = performed.find(record => record.oldAbsolutePath === forward.oldAbsolutePath)
  assert.ok(forwardOperation)
  assert.equal(forwardOperation.newAbsolutePath, forward.newAbsolutePath)
  assert.equal(failures.length, 1)
  assert.equal(failures[0].record.oldAbsolutePath, forward.oldAbsolutePath)
  assert.match(String(failures[0].error), /expected perform failure/)
  assert.ok(cancellationChecks >= 6)

  const remaining = await readPendingScriptRelocations(storageRoot)
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0].record.oldAbsolutePath, forward.oldAbsolutePath)

  let cancelled = false
  await assert.rejects(recoverScriptRelocations(storageRoot, {
    checkCancelled: () => {
      if (cancelled) throw new Error('expected cancellation')
      cancelled = true
    },
    pathExists: async () => false,
    perform: async () => undefined,
    reportFailure: () => undefined,
  }), /expected cancellation/)
  assert.equal((await readPendingScriptRelocations(storageRoot)).length, 1)
  console.log('ScriptRelocationRecovery contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
