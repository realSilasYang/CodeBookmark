/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-script-relocation-transaction`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-script-relocation-transaction` 对应契约。
 * 核心边界：通过断言锁定“verify-script-relocation-transaction”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  executeScriptRelocation,
  readPendingScriptRelocations,
} = require('../out/repository/ScriptRelocationJournal')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-relocation-transaction-'))
const successRoot = path.join(sandbox, 'success')
const failureRoot = path.join(sandbox, 'failure')

const relocation = storageRoot => ({
  oldAbsolutePath: path.join(sandbox, 'source'),
  newAbsolutePath: path.join(sandbox, 'target'),
  oldBookmarkFolder: path.join(storageRoot, 'scopes', 'old'),
  newBookmarkFolder: path.join(storageRoot, 'scopes', 'new'),
  oldBookmarkPath: 'src/old',
  newBookmarkPath: 'src/new',
})

async function main() {
  const result = await executeScriptRelocation(successRoot, relocation(successRoot), async record => {
    const pending = await readPendingScriptRelocations(successRoot)
    assert.equal(pending.length, 1)
    assert.equal(path.isAbsolute(record.oldBookmarkFolder), true)
    assert.equal(path.isAbsolute(record.newBookmarkFolder), true)
    assert.equal(record.oldBookmarkFolder, path.join(successRoot, 'scopes', 'old'))
    assert.equal(record.newBookmarkFolder, path.join(successRoot, 'scopes', 'new'))
    return 'completed'
  })
  assert.equal(result, 'completed')
  assert.deepEqual(await readPendingScriptRelocations(successRoot), [])
  assert.equal(fs.existsSync(path.join(successRoot, '.script-relocations')), false)

  const expectedFailure = new Error('expected relocation failure')
  await assert.rejects(
    executeScriptRelocation(failureRoot, relocation(failureRoot), async () => { throw expectedFailure }),
    error => error === expectedFailure,
  )
  const pendingAfterFailure = await readPendingScriptRelocations(failureRoot)
  assert.equal(pendingAfterFailure.length, 1)
  assert.equal(pendingAfterFailure[0].record.oldBookmarkFolder, path.join('scopes', 'old'))
  assert.equal(pendingAfterFailure[0].record.newBookmarkFolder, path.join('scopes', 'new'))
  console.log('ScriptRelocation transaction contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})
