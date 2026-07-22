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
