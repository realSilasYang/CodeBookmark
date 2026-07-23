const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { transferStorageRoot } = require('../out/repository/StorageRootTransfer')

function bookmark(id, label, scriptPath, subs = []) {
  return {
    id,
    createdAt: 1,
    label,
    path: scriptPath,
    collapsibleState: 0,
    pinned: false,
    iconName: '',
    isInvalid: false,
    params: '0,0,0,0',
    subs,
  }
}

function envelope(id, scriptPath, lastSeenAt, bookmarks) {
  return { script: { id, path: scriptPath, lastSeenAt }, bookmarks }
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-storage-transfer-'))
  const source = path.join(sandbox, 'source')
  const target = path.join(sandbox, 'target')
  const sourceWorkspace = path.join(source, 'scripts')
  const targetWorkspace = path.join(target, 'scripts')
  const sourceCodeRoot = path.join(source, 'code')
  const targetCodeRoot = path.join(target, 'code')
  const sourceScope = path.join(source, 'scopes', 'workspace_hash')
  const targetScope = path.join(target, 'scopes', 'workspace_hash')
  fs.mkdirSync(sourceWorkspace, { recursive: true })
  fs.mkdirSync(targetWorkspace, { recursive: true })
  fs.mkdirSync(sourceScope, { recursive: true })
  fs.mkdirSync(targetScope, { recursive: true })

  const sharedScriptId = '10000000-0000-9000-1000-000000000001'
  const copiedScriptId = '10000000-0000-9000-1000-000000000002'
  const sharedFile = `${sharedScriptId}.json`
  const copiedFile = `${copiedScriptId}.json`
  const sourceRenamedPath = path.join(sourceCodeRoot, 'src', 'renamed.ts')
  const targetOriginalPath = path.join(targetCodeRoot, 'src', 'original.ts')
  const sourceCopiedPath = path.join(sourceCodeRoot, 'src', 'copied.ts')
  fs.writeFileSync(path.join(sourceWorkspace, sharedFile), JSON.stringify(envelope(
    sharedScriptId,
    sourceRenamedPath,
    200,
    [
      bookmark('from-source', 'Source bookmark', sourceRenamedPath),
      bookmark('conflict-id', 'Source conflict', sourceRenamedPath, [
        bookmark('source-child', 'Source child', sourceRenamedPath),
      ]),
      bookmark('same-source', 'Same content', sourceRenamedPath),
    ],
  )))
  fs.writeFileSync(path.join(targetWorkspace, sharedFile), JSON.stringify(envelope(
    sharedScriptId,
    targetOriginalPath,
    100,
    [
      bookmark('from-target', 'Target bookmark', targetOriginalPath),
      bookmark('conflict-id', 'Target conflict', targetOriginalPath, [
        bookmark('target-child', 'Target child', targetOriginalPath),
      ]),
      bookmark('same-target', 'Same content', targetOriginalPath),
    ],
  )))
  fs.writeFileSync(path.join(sourceWorkspace, copiedFile), JSON.stringify(envelope(
    copiedScriptId,
    sourceCopiedPath,
    150,
    [bookmark('copied', 'Copied bookmark', sourceCopiedPath)],
  )))
  fs.writeFileSync(path.join(sourceScope, '_workspace_order.json'), JSON.stringify(['src/a.ts', 'src/b.ts']))
  fs.writeFileSync(path.join(targetScope, '_workspace_order.json'), JSON.stringify(['src/b.ts', 'src/c.ts']))
  fs.writeFileSync(path.join(source, 'unrelated-root-config.json'), '{}')
  fs.writeFileSync(path.join(source, '.storage-transfer.json'), '{}')
  fs.writeFileSync(path.join(source, '.storage-transfer.json.123.456.tmp'), 'stale journal temporary file')
  fs.writeFileSync(path.join(sourceWorkspace, `${copiedFile}.transfer-base`), 'old transfer backup')

  try {
    const first = await transferStorageRoot(source, target)
    assert.deepEqual(first, { copiedFiles: 1, mergedFiles: 2, conflictFiles: 0 })
    assert.equal(fs.existsSync(path.join(source, 'scripts')), false)
    assert.equal(fs.existsSync(path.join(source, 'scopes')), false)
    assert.equal(fs.existsSync(path.join(source, '.script-relocations')), false)
    assert.equal(fs.existsSync(path.join(source, '.storage-transfer.json')), false)
    assert.equal(fs.existsSync(path.join(source, '.storage-transfer.json.123.456.tmp')), false)
    assert.equal(fs.existsSync(path.join(source, 'unrelated-root-config.json')), true)
    assert.equal(fs.existsSync(path.join(targetWorkspace, copiedFile)), true)
    assert.equal(fs.existsSync(path.join(target, 'unrelated-root-config.json')), false)

    const mergedPath = path.join(targetWorkspace, sharedFile)
    const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'))
    assert.equal(merged.script.path, sourceRenamedPath)
    assert.equal(merged.bookmarks.length, 5)
    assert.equal(merged.bookmarks.some(item => item.id === 'same-target'), false)
    assert.equal(merged.bookmarks.some(item => item.id === 'conflict-id'), true)
    assert.equal(merged.bookmarks.some(item => item.label === 'Target conflict'), true)
    const allIds = []
    const collectIds = items => {
      for (const item of items) {
        allIds.push(item.id)
        collectIds(item.subs ?? [])
      }
    }
    collectIds(merged.bookmarks)
    assert.equal(new Set(allIds).size, allIds.length)
    for (const item of merged.bookmarks) {
      assert.equal(path.resolve(item.path), path.resolve(sourceRenamedPath))
      for (const child of item.subs ?? []) assert.equal(path.resolve(child.path), path.resolve(sourceRenamedPath))
    }
    assert.equal(fs.existsSync(`${mergedPath}.transfer-base`), true)
    assert.equal(fs.readdirSync(targetWorkspace).some(file => file.startsWith(`${sharedFile}.transfer-copy_`)), true)
    const mergedOrder = JSON.parse(fs.readFileSync(path.join(targetScope, '_workspace_order.json'), 'utf8'))
    assert.equal(mergedOrder.format, 'codebookmark.workspace-order')
    assert.equal(mergedOrder.schemaVersion, 1)
    assert.deepEqual(mergedOrder.order, [
      'src/b.ts', 'src/c.ts', 'src/a.ts',
    ])

    const second = await transferStorageRoot(source, target)
    assert.deepEqual(second, { copiedFiles: 0, mergedFiles: 0, conflictFiles: 0 })
    const mergedAgain = JSON.parse(fs.readFileSync(mergedPath, 'utf8'))
    assert.equal(mergedAgain.bookmarks.length, 5)
    const state = JSON.parse(fs.readFileSync(path.join(target, '.storage-transfer.json'), 'utf8'))
    assert.equal(state.format, 'codebookmark.storage-transfer')
    assert.equal(state.schemaVersion, 1)
    assert.equal(state.status, 'complete')

    const resumeSource = path.join(sandbox, 'resume-source')
    const resumeTarget = path.join(sandbox, 'resume-target')
    fs.mkdirSync(path.join(resumeSource, 'scripts'), { recursive: true })
    fs.mkdirSync(path.join(resumeTarget, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(resumeSource, 'scripts', 'already.json'), '{"same":true}')
    fs.writeFileSync(path.join(resumeTarget, 'scripts', 'already.json'), '{"same":true}')
    fs.writeFileSync(path.join(resumeSource, 'scripts', 'remaining.json'), '{"remaining":true}')
    fs.writeFileSync(path.join(resumeTarget, '.storage-transfer.json'), JSON.stringify({
      status: 'in_progress',
      source: path.resolve(resumeSource),
      target: path.resolve(resumeTarget),
      startedAt: '2026-01-01T00:00:00.000Z',
      copiedFiles: 1,
      mergedFiles: 0,
      conflictFiles: 0,
    }))
    const resumed = await transferStorageRoot(resumeSource, resumeTarget)
    assert.deepEqual(resumed, { copiedFiles: 2, mergedFiles: 0, conflictFiles: 0 })
    const resumedState = JSON.parse(fs.readFileSync(path.join(resumeTarget, '.storage-transfer.json'), 'utf8'))
    assert.equal(resumedState.format, 'codebookmark.storage-transfer')
    assert.equal(resumedState.schemaVersion, 1)
    assert.equal(resumedState.status, 'complete')
    assert.equal(resumedState.startedAt, '2026-01-01T00:00:00.000Z')
    assert.equal(fs.existsSync(path.join(resumeTarget, '.storage-transfer.json.migration-v0.backup')), false)
    assert.equal(fs.existsSync(path.join(resumeTarget, 'scripts', 'remaining.json')), true)
    assert.equal(fs.existsSync(path.join(resumeSource, 'scripts')), false)

    const failedSource = path.join(sandbox, 'failed-source')
    const failedTarget = path.join(sandbox, 'failed-target')
    const failedSourceFile = path.join(failedSource, 'scripts', 'blocked.json')
    fs.mkdirSync(path.dirname(failedSourceFile), { recursive: true })
    fs.mkdirSync(path.join(failedTarget, 'scripts', 'blocked.json'), { recursive: true })
    fs.writeFileSync(failedSourceFile, '{"source":true}')
    await assert.rejects(transferStorageRoot(failedSource, failedTarget))
    assert.equal(fs.existsSync(failedSourceFile), true)

    await assert.rejects(
      transferStorageRoot(source, path.join(source, 'nested')),
      /不能互相包含/,
    )
    const sourceAlias = path.join(sandbox, 'source-alias')
    try {
      fs.symlinkSync(source, sourceAlias, process.platform === 'win32' ? 'junction' : 'dir')
      await assert.rejects(
        transferStorageRoot(source, path.join(sourceAlias, 'nested-through-alias')),
        /符号链接|目录联接/,
      )
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
