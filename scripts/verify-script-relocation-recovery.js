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
