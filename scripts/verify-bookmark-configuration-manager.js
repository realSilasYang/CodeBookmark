const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  listBookmarkConfigurationFiles,
  removeBookmarkConfigurationFiles,
} = require('../out/repository/BookmarkConfigurationCatalog')

function bookmark(id, label, subs = [], extra = {}) {
  return { id, label, subs, ...extra }
}

function envelope(id, scriptPath, bookmarks, extra = {}) {
  return {
    script: { id, path: scriptPath, lastSeenAt: 1_800_000_000_000, ...extra },
    bookmarks,
  }
}

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-configuration-manager-'))
  const storageRoot = path.join(sandbox, 'storage')
  const scripts = path.join(storageRoot, 'scripts')
  const scopes = path.join(storageRoot, 'scopes')
  const source = path.join(sandbox, 'source.ts')
  const missingSource = path.join(sandbox, 'missing.ts')
  const primaryId = '10000000-0000-9000-1000-000000000001'
  const missingId = '10000000-0000-9000-1000-000000000002'
  const backupId = '10000000-0000-9000-1000-000000000003'
  const conflictId = '10000000-0000-9000-1000-000000000004'
  fs.mkdirSync(scripts, { recursive: true })
  fs.writeFileSync(source, 'export const value = 1\n')
  fs.writeFileSync(path.join(scripts, `${primaryId}.json`), JSON.stringify(envelope(primaryId, source, [
    bookmark('a', '入口', [
      bookmark('b', '自动任务', [], { codeMarker: { kind: 'TODO' } }),
      bookmark('c', '失效分支', [], { isInvalid: true }),
    ]),
  ])))
  fs.writeFileSync(path.join(scripts, `${missingId}.json`), JSON.stringify(envelope(
    missingId,
    missingSource,
    [bookmark('d', '缺失脚本')],
    { missingSince: 1_800_000_001_000 },
  )))
  fs.writeFileSync(path.join(scripts, `${backupId}.json.transfer-base`), JSON.stringify(envelope(
    backupId,
    source,
    [bookmark('e', '迁移备份')],
  )))
  fs.writeFileSync(path.join(scripts, `${conflictId}.transfer-conflict_deadbeef.json`), JSON.stringify(envelope(
    conflictId,
    source,
    [bookmark('f', '冲突副本')],
  )))
  fs.writeFileSync(path.join(scripts, 'broken.json'), '{broken')
  fs.writeFileSync(path.join(scripts, 'ignored.1.tmp'), 'temporary')
  const firstScope = path.join(scopes, '测试工作区_0123456789abcdef')
  const secondScope = path.join(scopes, '另一个工作区_fedcba9876543210')
  fs.mkdirSync(firstScope, { recursive: true })
  fs.mkdirSync(secondScope, { recursive: true })
  fs.writeFileSync(path.join(firstScope, '_workspace_order.json'), JSON.stringify(['src/entry.ts', 'src/task.ts']))
  fs.writeFileSync(path.join(secondScope, '_workspace_order.json'), JSON.stringify(['background.js']))
  fs.writeFileSync(path.join(storageRoot, '.storage-transfer.json'), JSON.stringify({
    status: 'complete',
    source: 'D:\\旧书签目录',
    target: storageRoot,
    startedAt: '2026-07-22T13:05:42.420Z',
    completedAt: '2026-07-22T13:05:42.451Z',
    copiedFiles: 5,
    mergedFiles: 1,
    conflictFiles: 2,
  }))
  const outside = path.join(sandbox, 'outside.json')
  fs.writeFileSync(outside, 'outside')

  try {
    const entries = await listBookmarkConfigurationFiles(storageRoot)
    assert.equal(entries.length, 8)
    assert.equal(entries.some(entry => entry.fileName === 'ignored.1.tmp'), false)

    const primary = entries.find(entry => entry.fileName === `${primaryId}.json`)
    assert.ok(primary)
    assert.equal(primary.role, 'primary')
    assert.equal(primary.health, 'bound')
    assert.equal(primary.sourceExists, true)
    assert.deepEqual(primary.bookmarkSummary, { total: 3, levelCounts: [1, 2] })
    assert.equal(primary.automaticBookmarkCount, 1)
    assert.equal(primary.invalidBookmarkCount, 1)
    assert.deepEqual(primary.labelPreview, ['入口', '自动任务', '失效分支'])

    const missing = entries.find(entry => entry.fileName === `${missingId}.json`)
    assert.equal(missing.health, 'missing')
    assert.equal(missing.sourceExists, false)
    assert.equal(entries.find(entry => entry.fileName.endsWith('.transfer-base')).role, 'backup')
    assert.equal(entries.find(entry => entry.fileName.includes('.transfer-conflict_')).role, 'conflict')
    assert.equal(entries.find(entry => entry.fileName === 'broken.json').health, 'invalid')

    const workspaceOrders = entries.filter(entry => entry.kind === 'workspaceOrder')
    assert.equal(workspaceOrders.length, 2)
    assert.equal(new Set(workspaceOrders.map(entry => entry.storagePath)).size, 2)
    assert.equal(new Set(workspaceOrders.map(entry => entry.fileName)).size, 1)
    const firstOrder = workspaceOrders.find(entry => entry.workspaceName === '测试工作区')
    assert.ok(firstOrder)
    assert.equal(firstOrder.role, 'workspaceOrder')
    assert.equal(firstOrder.health, 'metadata')
    assert.equal(firstOrder.workspacePathHash, '0123456789abcdef')
    assert.deepEqual(firstOrder.orderedPaths, ['src/entry.ts', 'src/task.ts'])

    const transfer = entries.find(entry => entry.kind === 'transferJournal')
    assert.ok(transfer)
    assert.equal(transfer.storagePath, '.storage-transfer.json')
    assert.equal(transfer.role, 'transferJournal')
    assert.equal(transfer.health, 'metadata')
    assert.equal(transfer.transferStatus, 'complete')
    assert.equal(transfer.transferSource, 'D:\\旧书签目录')
    assert.equal(transfer.transferTarget, storageRoot)
    assert.equal(transfer.transferStartedAt, Date.parse('2026-07-22T13:05:42.420Z'))
    assert.equal(transfer.transferCompletedAt, Date.parse('2026-07-22T13:05:42.451Z'))
    assert.equal(transfer.transferCopiedFiles, 5)
    assert.equal(transfer.transferMergedFiles, 1)
    assert.equal(transfer.transferConflictFiles, 2)

    const staleRequest = { storagePath: primary.storagePath, revision: primary.revision }
    fs.appendFileSync(primary.filePath, '\n')
    const staleResult = await removeBookmarkConfigurationFiles(storageRoot, [staleRequest], {
      deleteFile: filePath => fs.promises.unlink(filePath),
    })
    assert.equal(staleResult.deletedFiles, 0)
    assert.equal(staleResult.changedFiles, 1)
    assert.equal(fs.existsSync(primary.filePath), true)

    const backup = entries.find(entry => entry.fileName.endsWith('.transfer-base'))
    const deleteResult = await removeBookmarkConfigurationFiles(storageRoot, [
      { storagePath: backup.storagePath, revision: backup.revision },
      { storagePath: '../outside.json', revision: 'not-used' },
      { storagePath: 'scripts/already-missing.json', revision: 'not-used' },
    ], {
      deleteFile: filePath => fs.promises.unlink(filePath),
    })
    assert.equal(deleteResult.requestedFiles, 3)
    assert.equal(deleteResult.deletedFiles, 1)
    assert.equal(deleteResult.missingFiles, 1)
    assert.equal(deleteResult.failedFiles, 1)
    assert.deepEqual(deleteResult.bookmarkSummary, { total: 1, levelCounts: [1] })
    assert.equal(fs.existsSync(backup.filePath), false)
    assert.equal(fs.existsSync(outside), true)

    const metadataDeleteResult = await removeBookmarkConfigurationFiles(storageRoot, [
      { storagePath: firstOrder.storagePath, revision: firstOrder.revision },
      { storagePath: transfer.storagePath, revision: transfer.revision },
    ], {
      deleteFile: filePath => fs.promises.unlink(filePath),
      deleteEmptyDirectory: directoryPath => fs.promises.rmdir(directoryPath),
    })
    assert.equal(metadataDeleteResult.deletedFiles, 2)
    assert.deepEqual(metadataDeleteResult.bookmarkSummary, { total: 0, levelCounts: [] })
    assert.equal(fs.existsSync(firstOrder.filePath), false)
    assert.equal(fs.existsSync(firstScope), false)
    assert.equal(fs.existsSync(transfer.filePath), false)
    assert.equal(fs.existsSync(workspaceOrders.find(entry => entry !== firstOrder).filePath), true)

    const metadataOnlyRoot = path.join(sandbox, 'metadata-only')
    fs.mkdirSync(metadataOnlyRoot, { recursive: true })
    fs.writeFileSync(path.join(metadataOnlyRoot, '.storage-transfer.json'), JSON.stringify({
      status: 'in_progress', source: 'source', target: 'target', copiedFiles: 0, mergedFiles: 0, conflictFiles: 0,
    }))
    const metadataOnlyEntries = await listBookmarkConfigurationFiles(metadataOnlyRoot)
    assert.equal(metadataOnlyEntries.length, 1)
    assert.equal(metadataOnlyEntries[0].kind, 'transferJournal')

    const { loadLocalizedManifest } = require('./lib/localized-manifest')
    const manifest = loadLocalizedManifest('zh-cn')
    const englishManifest = loadLocalizedManifest('en')
    const commands = new Map(manifest.contributes.commands.map(command => [command.command, command]))
    const englishCommands = new Map(englishManifest.contributes.commands.map(command => [command.command, command]))
    assert.equal(
      commands.get('codebookmark.manageBookmarkConfigurations')?.title,
      '$(files) 书签配置文件管理',
    )
    assert.equal(
      englishCommands.get('codebookmark.manageBookmarkConfigurations')?.title,
      '$(files) Manage Bookmark Configurations',
    )
    const moreMenu = manifest.contributes.menus['codebookmark.moreSubmenu']
    const identities = moreMenu.map(item => item.command ?? item.submenu)
    assert.deepEqual(identities.slice(-5), [
      'codebookmark.bookmark.sort',
      'codebookmark.exportSubmenu',
      'codebookmark.manageBookmarkConfigurations',
      'codebookmark.openHelp',
      'codebookmark.openSettings',
    ])
    const manageItem = moreMenu.find(item => item.command === 'codebookmark.manageBookmarkConfigurations')
    const exportItem = moreMenu.find(item => item.submenu === 'codebookmark.exportSubmenu')
    assert.notEqual(manageItem.group.split('@', 1)[0], exportItem.group.split('@', 1)[0])

    const commandSource = fs.readFileSync('src/commands/bookmarkCommands.ts', 'utf8')
    const panelSource = fs.readFileSync('src/providers/BookmarkConfigurationManagerWebview.ts', 'utf8')
    const providerSource = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
    assert.match(commandSource, /provider\.openBookmarkConfigurationManager\(\)/)
    assert.match(panelSource, /搜索脚本路径、工作区、记录或书签标签/)
    assert.match(panelSource, /书签配置文件管理/)
    assert.doesNotMatch(panelSource, /管理书签配置文件/)
    assert.match(panelSource, /openStorageRoot/)
    assert.match(panelSource, /revealStorageRoot/)
    assert.match(panelSource, /resultAll: localize\('当前显示 \{shown\} 条记录，共 \{total\} 条', 'Showing \{shown\} of \{total\} records'\)/)
    assert.match(panelSource, /resultFiltered: localize\('当前显示 \{shown\} 条记录，符合条件 \{matched\} 条，共 \{total\} 条', 'Showing \{shown\} of \{matched\} matching records; \{total\} total'\)/)
    assert.match(panelSource, /formatText\(text\.resultAll, \{ shown: formatNumber\(displayedEntries\.length\), total: formatNumber\(state\.entries\.length\) \}\)/)
    assert.match(panelSource, /totalBookmarks: localize\('共 \{count\} 个书签', '\{count\} bookmarks'\)/)
    assert.match(panelSource, /automaticBookmarks: localize\('自动书签 \{count\} 个', 'Automatic bookmarks: \{count\}'\)/)
    assert.match(panelSource, /invalidBookmarks: localize\('失效或异常 \{count\} 个', 'Invalid or abnormal: \{count\}'\)/)
    assert.match(panelSource, /打开脚本/)
    assert.match(panelSource, /定位文件/)
    assert.match(panelSource, /删除配置/)
    assert.match(panelSource, /清理记录/)
    assert.match(panelSource, /删除所选/)
    assert.match(panelSource, /id="delete-confirmation" class="modal-backdrop" hidden/)
    assert.match(panelSource, /role="dialog" aria-modal="true"/)
    assert.match(panelSource, /--vscode-editorWidget-background/)
    assert.match(panelSource, /--vscode-widget-border/)
    assert.match(panelSource, /--vscode-button-background/)
    assert.match(panelSource, /openDeleteConfirmation/)
    assert.match(panelSource, /confirmDelete/)
    assert.match(panelSource, /event\.key === 'Escape'/)
    assert.match(panelSource, /closeDeleteConfirmation\(true\)/)
    assert.match(panelSource, /--vscode-checkbox-background/)
    assert.match(panelSource, /--vscode-checkbox-border/)
    assert.match(panelSource, /--vscode-dropdown-background/)
    assert.match(panelSource, /--vscode-dropdown-foreground/)
    assert.doesNotMatch(panelSource, /<select/)
    assert.match(panelSource, /role="combobox"/)
    assert.match(panelSource, /role="listbox"/)
    assert.match(panelSource, /\.dropdown-option:hover, \.dropdown-option\.active/)
    assert.match(panelSource, /--vscode-list-activeSelectionBackground/)
    assert.match(panelSource, /function setupDropdown\(id\)/)
    assert.match(panelSource, /toLocaleLowerCase\(locale\)/)
    assert.match(panelSource, /localeCompare\([^\n]+, locale\)/)
    assert.match(panelSource, /Intl\.DateTimeFormat\(locale/)
    assert.match(panelSource, /Intl\.NumberFormat\(locale/)
    assert.match(panelSource, /event\.key === 'Escape'/)
    assert.match(panelSource, /max-width: 1680px/)
    assert.match(panelSource, /body \{ padding: 24px;/)
    assert.match(panelSource, /body \{ padding: 12px;/)
    assert.match(panelSource, /<main class="page">/)
    assert.match(panelSource, /--content-inset: 24px/)
    assert.match(panelSource, /col\.action-col \{ width: 160px; \}/)
    assert.match(panelSource, /col\.script-col \{ width: 33%; \}/)
    assert.match(panelSource, /col\.status-col \{ width: 110px; \}/)
    assert.match(panelSource, /col\.count-col \{ width: 17%; \}/)
    assert.match(panelSource, /col\.info-col \{ width: 28%; \}/)
    assert.match(panelSource, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/)
    assert.match(panelSource, /font-size: 12px; white-space: nowrap/)
    assert.match(panelSource, /white-space: nowrap/)
    assert.match(panelSource, /绑定信息更新：/)
    assert.match(panelSource, /工作区排序/)
    assert.match(panelSource, /存储迁移记录/)
    assert.match(panelSource, /历史元数据/)
    assert.match(panelSource, /entry\.storagePath/)
    assert.doesNotMatch(panelSource, /this\.entries\.set\(entry\.fileName/)
    assert.doesNotMatch(panelSource, /脚本确认：/)
    assert.match(providerSource, /revealStorageRoot: async storageRoot =>/)
    assert.match(providerSource, /executeCommand\('revealFileInOS', vscode\.Uri\.file\(storageRoot\)\)/)
    assert.match(panelSource, /Content-Security-Policy/)
    assert.doesNotMatch(panelSource, /innerHTML\s*=/)
    assert.match(providerSource, /beginStorageTransition\(\)/)
    assert.match(providerSource, /finishStorageTransition\(\)/)
    assert.match(providerSource, /cancelStorageTransition\(\)/)
    assert.doesNotMatch(providerSource, /确定清理 \$\{requests\.length\}/)
    assert.doesNotMatch(providerSource, /modal: true,\s*\n\s*detail: detailParts/)
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().then(
  () => console.log('Bookmark configuration manager contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
