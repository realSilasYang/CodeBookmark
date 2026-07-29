/**
 * 覆盖配置管理列表、健康状态、重新绑定、删除与残留清理的界面消息和控制器行为。
 * 脚本在临时目录中调用编译后的 `BookmarkConfigurationCatalog` 完成真实操作，检查落盘结果而不是内存假象。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { prefixMenuSymbol } = require('./lib/manifest-menu-symbols')

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

function workspaceLayout(scriptId, bookmarkId) {
  const file = { kind: 'script', scriptId }
  const mark = { kind: 'bookmark', scriptId, bookmarkId }
  return {
    format: 'codebookmark.workspace-layout', schemaVersion: 1, updatedAt: 1_800_000_000_000,
    entries: [{ node: file, parent: null }, { node: mark, parent: file }],
    hiddenFiles: [], pinnedContainer: mark,
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
  fs.writeFileSync(path.join(firstScope, '_workspace_order.json.transfer-base'), JSON.stringify(['legacy.ts']))
  const layoutScriptId = '10000000-0000-9000-1000-000000000021'
  const layoutBookmarkId = '20000000-0000-9000-1000-000000000022'
  const layout = workspaceLayout(layoutScriptId, layoutBookmarkId)
  fs.writeFileSync(path.join(firstScope, '_workspace_layout.json'), JSON.stringify(layout))
  fs.writeFileSync(path.join(firstScope, '_workspace_layout.relocation-conflict_deadbeef1234.json'), JSON.stringify(layout))
  fs.writeFileSync(path.join(secondScope, '_workspace_layout.json.transfer-copy_deadbeef1234'), JSON.stringify(layout))
  fs.writeFileSync(path.join(firstScope, 'batch-rename-1800000000000.txt'), '\t入口\n\t自动任务\n')
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
	const exchanges = path.join(storageRoot, 'exchanges')
	const exchangeId = '30000000-0000-4000-8000-000000000001'
	const exchangeRevisionId = '40000000-0000-4000-8000-000000000001'
	fs.mkdirSync(exchanges, { recursive: true })
	fs.writeFileSync(path.join(exchanges, 'exchange.json'), JSON.stringify({
		format: 'codebookmark.portable-exchange', schemaVersion: 1,
		exchangeId, scopeKey: 'workspace:D:\\项目', lastRevisionId: exchangeRevisionId,
		updatedAt: 1_800_000_002_000,
		scriptMappings: { [primaryId]: primaryId },
		bookmarkMappings: { [layoutBookmarkId]: layoutBookmarkId },
		baseScripts: [{ format: 'codebookmark.portable-script', schemaVersion: 1, scriptId: primaryId, bookmarks: [] }],
	}))
	fs.writeFileSync(path.join(exchanges, 'broken.json'), '{broken')
	fs.copyFileSync(path.join(exchanges, 'exchange.json'), path.join(exchanges, 'exchange.json.transfer-base'))
  const outside = path.join(sandbox, 'outside.json')
  fs.writeFileSync(outside, 'outside')

  try {
    const entries = await listBookmarkConfigurationFiles(storageRoot)
    assert.equal(entries.length, 16)
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
    assert.equal(workspaceOrders.length, 3)
    assert.equal(new Set(workspaceOrders.map(entry => entry.storagePath)).size, 3)
    assert.equal(new Set(workspaceOrders.map(entry => entry.fileName)).size, 2)
    const firstOrder = workspaceOrders.find(entry => entry.workspaceName === '测试工作区' && entry.role === 'workspaceOrder')
    assert.ok(firstOrder)
    assert.equal(firstOrder.role, 'workspaceOrder')
    assert.equal(firstOrder.health, 'valid')
    assert.equal(firstOrder.workspacePathHash, '0123456789abcdef')
    assert.deepEqual(firstOrder.orderedPaths, ['src/entry.ts', 'src/task.ts'])
    const workspaceLayouts = entries.filter(entry => entry.kind === 'workspaceLayout')
    assert.equal(workspaceLayouts.length, 3)
    const primaryLayout = workspaceLayouts.find(entry => entry.fileName === '_workspace_layout.json')
    const conflictLayout = workspaceLayouts.find(entry => entry.fileName.includes('.relocation-conflict_'))
    const backupLayout = workspaceLayouts.find(entry => entry.fileName.includes('.transfer-copy_'))
    assert.equal(primaryLayout.role, 'workspaceLayout')
    assert.equal(primaryLayout.health, 'valid')
    assert.equal(primaryLayout.layoutNodeCount, 2)
    assert.equal(primaryLayout.layoutCrossFileRelationCount, 0)
    assert.equal(primaryLayout.layoutHiddenFileCount, 0)
    assert.equal(primaryLayout.layoutExpandedNodeCount, 0)
    assert.equal(primaryLayout.layoutCollapsedNodeCount, 0)
    assert.equal(primaryLayout.layoutPinnedContainer, `bookmark:${layoutScriptId}:${layoutBookmarkId}`)
    assert.equal(conflictLayout.role, 'conflict')
    assert.equal(conflictLayout.health, 'snapshot')
    assert.equal(backupLayout.role, 'backup')
    assert.equal(backupLayout.health, 'snapshot')
    const orderBackup = entries.find(entry => entry.fileName === '_workspace_order.json.transfer-base')
    assert.equal(orderBackup.kind, 'workspaceOrder')
    assert.equal(orderBackup.role, 'backup')
    assert.equal(orderBackup.health, 'snapshot')

    const currentWorkspaceData = entries.filter(entry => entry.role === 'workspaceOrder' || entry.role === 'workspaceLayout')
    const historicalCopies = entries.filter(entry => ['backup', 'conflict', 'superseded'].includes(entry.role))
    assert.equal(currentWorkspaceData.length, 3)
    assert.equal(currentWorkspaceData.every(entry => entry.health === 'valid'), true)
    assert.equal(historicalCopies.length, 6)
    assert.equal(historicalCopies.every(entry => entry.health === 'snapshot'), true)

    const batchRenameDraft = entries.find(entry => entry.kind === 'temporaryArtifact')
    assert.ok(batchRenameDraft)
    assert.equal(batchRenameDraft.role, 'batchRenameTemporary')
    assert.equal(batchRenameDraft.health, 'temporary')
    assert.equal(batchRenameDraft.workspaceName, '测试工作区')
    assert.equal(batchRenameDraft.workspacePathHash, '0123456789abcdef')
    assert.deepEqual(batchRenameDraft.labelPreview, ['入口', '自动任务'])

    const transfer = entries.find(entry => entry.kind === 'transferJournal')
    assert.ok(transfer)
    assert.equal(transfer.storagePath, '.storage-transfer.json')
    assert.equal(transfer.role, 'transferJournal')
    assert.equal(transfer.health, 'valid')
    assert.equal(transfer.transferStatus, 'complete')
    assert.equal(transfer.transferSource, 'D:\\旧书签目录')
    assert.equal(transfer.transferTarget, storageRoot)
    assert.equal(transfer.transferStartedAt, Date.parse('2026-07-22T13:05:42.420Z'))
    assert.equal(transfer.transferCompletedAt, Date.parse('2026-07-22T13:05:42.451Z'))
    assert.equal(transfer.transferCopiedFiles, 5)
    assert.equal(transfer.transferMergedFiles, 1)
    assert.equal(transfer.transferConflictFiles, 2)

		const exchange = entries.find(entry => entry.kind === 'portableExchange' && entry.health === 'valid')
		assert.ok(exchange)
		assert.equal(exchange.role, 'portableExchange')
		assert.equal(exchange.exchangeId, exchangeId)
		assert.equal(exchange.exchangeScope, 'workspace:D:\\项目')
		assert.equal(exchange.exchangeRevisionId, exchangeRevisionId)
		assert.equal(exchange.exchangeUpdatedAt, 1_800_000_002_000)
		assert.equal(exchange.exchangeScriptMappingCount, 1)
		assert.equal(exchange.exchangeBookmarkMappingCount, 1)
		assert.equal(exchange.exchangeBaseScriptCount, 1)
		assert.equal(entries.some(entry => entry.kind === 'portableExchange' && entry.health === 'invalid'), true)
		assert.equal(entries.some(entry => entry.kind === 'portableExchange' && entry.role === 'backup' && entry.health === 'snapshot'), true)

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

    const recordDeleteResult = await removeBookmarkConfigurationFiles(storageRoot, [
      { storagePath: firstOrder.storagePath, revision: firstOrder.revision },
      { storagePath: conflictLayout.storagePath, revision: conflictLayout.revision },
      { storagePath: transfer.storagePath, revision: transfer.revision },
			{ storagePath: exchange.storagePath, revision: exchange.revision },
      { storagePath: batchRenameDraft.storagePath, revision: batchRenameDraft.revision },
    ], {
      deleteFile: filePath => fs.promises.unlink(filePath),
      deleteEmptyDirectory: directoryPath => fs.promises.rmdir(directoryPath),
    })
    assert.equal(recordDeleteResult.deletedFiles, 5)
    assert.deepEqual(recordDeleteResult.bookmarkSummary, { total: 0, levelCounts: [] })
    assert.equal(fs.existsSync(firstOrder.filePath), false)
    assert.equal(fs.existsSync(conflictLayout.filePath), false)
    assert.equal(fs.existsSync(firstScope), true)
    assert.equal(fs.existsSync(transfer.filePath), false)
		assert.equal(fs.existsSync(exchange.filePath), false)
    assert.equal(fs.existsSync(batchRenameDraft.filePath), false)
    assert.equal(fs.existsSync(workspaceOrders.find(entry => entry !== firstOrder).filePath), true)

    const journalOnlyRoot = path.join(sandbox, 'journal-only')
    fs.mkdirSync(journalOnlyRoot, { recursive: true })
    fs.writeFileSync(path.join(journalOnlyRoot, '.storage-transfer.json'), JSON.stringify({
      status: 'in_progress', source: 'source', target: 'target', copiedFiles: 0, mergedFiles: 0, conflictFiles: 0,
    }))
    const journalOnlyEntries = await listBookmarkConfigurationFiles(journalOnlyRoot)
    assert.equal(journalOnlyEntries.length, 1)
    assert.equal(journalOnlyEntries[0].kind, 'transferJournal')

    const { loadLocalizedManifest } = require('./lib/localized-manifest')
    const manifest = loadLocalizedManifest('zh-cn')
    const englishManifest = loadLocalizedManifest('en')
    const commands = new Map(manifest.contributes.commands.map(command => [command.command, command]))
    const englishCommands = new Map(englishManifest.contributes.commands.map(command => [command.command, command]))
    assert.equal(
      commands.get('codebookmark.manageBookmarkConfigurations')?.title,
      prefixMenuSymbol('书签配置文件管理', '▤'),
    )
    assert.equal(
      englishCommands.get('codebookmark.manageBookmarkConfigurations')?.title,
      prefixMenuSymbol('Bookmark Configuration Manager', '▤'),
    )
    const moreMenu = manifest.contributes.menus['codebookmark.moreSubmenu']
    assert.deepEqual(moreMenu.slice(-5), [
      { command: 'codebookmark.bookmark.sort', group: '1_primary@1' },
      { submenu: 'codebookmark.exchangeSubmenu', group: '1_primary@2' },
      { command: 'codebookmark.manageBookmarkConfigurations', group: '1_primary@3' },
      { command: 'codebookmark.openSettings', group: '2_secondary@1' },
      { command: 'codebookmark.openHelp', group: '2_secondary@2' },
    ])
    const manageItem = moreMenu.find(item => item.command === 'codebookmark.manageBookmarkConfigurations')
    const exportItem = moreMenu.find(item => item.submenu === 'codebookmark.exchangeSubmenu')
    const settingsItem = moreMenu.find(item => item.command === 'codebookmark.openSettings')
    assert.equal(manageItem.group.split('@', 1)[0], exportItem.group.split('@', 1)[0])
    assert.notEqual(manageItem.group.split('@', 1)[0], settingsItem.group.split('@', 1)[0])

    const commandSource = fs.readFileSync('src/commands/bookmarkCommands.ts', 'utf8')
    const panelSource = fs.readFileSync('src/providers/BookmarkConfigurationManagerWebview.ts', 'utf8')
    const providerSource = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
    const controllerSource = fs.readFileSync('src/providers/BookmarkConfigurationManagementController.ts', 'utf8')
    assert.match(commandSource, /provider\.openBookmarkConfigurationManager\(\)/)
    const messageListenerRegistration = panelSource.indexOf('this.panel.webview.onDidReceiveMessage(')
    const htmlAssignment = panelSource.indexOf('this.panel.webview.html = this.html()')
    assert.ok(messageListenerRegistration >= 0 && htmlAssignment > messageListenerRegistration,
      'Webview message handling must be registered before HTML can post the ready message')
    const { installModuleMocks } = require('./test-support/module-mocks')
    const restoreModuleMocks = installModuleMocks({
      vscode: { window: { createOutputChannel: () => ({ appendLine() {}, dispose() {} }) } },
    })
    let managerHtml
    let englishManagerHtml
    try {
      const { BookmarkConfigurationManagerWebview } = require('../out/providers/BookmarkConfigurationManagerWebview')
      const { initializeLocalization } = require('../out/i18n/Localization')
      const manager = Object.create(BookmarkConfigurationManagerWebview.prototype)
      manager.panel = { webview: { cspSource: 'vscode-webview://configuration-manager-test' } }
      initializeLocalization('zh-cn')
      managerHtml = manager.html()
      initializeLocalization('en')
      englishManagerHtml = manager.html()
      initializeLocalization('zh-cn')
    } finally {
      restoreModuleMocks()
    }
    const embeddedScript = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(managerHtml)?.[1]
    assert.ok(embeddedScript, 'configuration manager HTML must contain its client script')
    assert.doesNotThrow(() => new vm.Script(embeddedScript),
      'configuration manager client script must remain valid after template interpolation')
    assert.match(managerHtml, />工作区数据</)
    assert.match(managerHtml, /id="filter-option-workspace-data"[^>]*>当前工作区数据</)
    assert.match(managerHtml, /id="filter-option-transfer"[^>]*>存储迁移记录</)
		assert.match(managerHtml, /id="filter-option-exchange"[^>]*>可迁移配置交换记录</)
    assert.match(managerHtml, /id="filter-option-temporary"[^>]*>临时残留</)
    assert.match(englishManagerHtml, />Workspace Data</)
    assert.match(englishManagerHtml, /id="filter-option-workspace-data"[^>]*>Current Workspace Data</)
    assert.match(englishManagerHtml, /id="filter-option-transfer"[^>]*>Storage Transfer Journals</)
		assert.match(englishManagerHtml, /id="filter-option-exchange"[^>]*>Portable-Configuration Exchange Records</)
    assert.match(englishManagerHtml, /id="filter-option-temporary"[^>]*>Temporary Files</)
    assert.doesNotMatch(managerHtml, /历史元数据|Historical Metadata/)
    assert.doesNotMatch(englishManagerHtml, /历史元数据|Historical Metadata/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.searchScriptPathsWorkspacesRecordsOrBookmarkLabels/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.bookmarkConfigurationManager/)
    assert.match(panelSource, /openStorageRoot/)
    assert.match(panelSource, /revealStorageRoot/)
    assert.match(panelSource, /resultAll: localize\("providers\.BookmarkConfigurationManagerWebview\.showingOfRecords2"\)/)
    assert.match(panelSource, /resultFiltered: localize\("providers\.BookmarkConfigurationManagerWebview\.showingOfMatchingRecordsTotal"\)/)
    assert.match(panelSource, /formatText\(text\.resultAll, \{ shown: formatNumber\(displayedEntries\.length\), total: formatNumber\(state\.entries\.length\) \}\)/)
    assert.match(panelSource, /totalBookmarks: localize\("providers\.BookmarkConfigurationManagerWebview\.bookmarks3"\)/)
    assert.match(panelSource, /automaticBookmarks: localize\("providers\.BookmarkConfigurationManagerWebview\.automaticBookmarks"\)/)
    assert.match(panelSource, /invalidBookmarks: localize\("providers\.BookmarkConfigurationManagerWebview\.invalidOrAbnormal"\)/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.openScript/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.revealFile/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.deleteConfiguration/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.removeRecord/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.deleteSelected/)
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
    assert.match(panelSource, /\.detail-value \{ cursor: help; \}/)
    assert.match(panelSource, /function appendDetailedValue\(cell, className, value, detail = value\)/)
    assert.match(panelSource, /element\.title = detail/)
    assert.match(panelSource, /appendDetailedValue\(cell, 'preview', preview, paths\.join\(String\.fromCharCode\(10\)\)\)/)
    assert.match(panelSource, /if \(entry\.problem\) appendDetailedValue\(scriptCell, 'preview', entry\.problem\)/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.bindingUpdated/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.workspaceOrder/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.workspaceData/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.currentWorkspaceData/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.storageTransferJournal/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.batchRenameTemporaryFile/)
    assert.match(panelSource, /BookmarkConfigurationManagerWebview\.temporaryArtifact/)
    assert.match(panelSource, /valid: localize\("providers\.BookmarkConfigurationManagerWebview\.validRecord"\)/)
    assert.match(panelSource, /if \(filter === 'workspaceData'\) return isCurrentWorkspaceData\(entry\)/)
    assert.match(panelSource, /if \(filter === 'transfer'\) return entry\.kind === 'transferJournal'/)
		assert.match(panelSource, /if \(filter === 'exchange'\) return entry\.kind === 'portableExchange'/)
    assert.match(panelSource, /filter-option-empty/)
    assert.match(panelSource, /filter-option-temporary/)
    assert.match(panelSource, /state\.entries\.filter\(isCurrentWorkspaceData\)\.length/)
    assert.doesNotMatch(panelSource, /entry\.kind !== 'script'/)
    assert.doesNotMatch(panelSource, /历史元数据|Historical Metadata|metadata/i)
    assert.match(panelSource, /entry\.storagePath/)
    assert.doesNotMatch(panelSource, /this\.entries\.set\(entry\.fileName/)
    assert.doesNotMatch(panelSource, /脚本确认：/)
    assert.match(providerSource, /this\.configurationManagementController\.open\(\)/)
    assert.match(controllerSource, /revealStorageRoot: async storageRoot =>/)
    assert.match(controllerSource, /executeCommand\('revealFileInOS', vscode\.Uri\.file\(storageRoot\)\)/)
    assert.match(panelSource, /Content-Security-Policy/)
    assert.doesNotMatch(panelSource, /innerHTML\s*=/)
    assert.match(controllerSource, /beginStorageTransition\(\)/)
    assert.match(controllerSource, /finishStorageTransition\(\)/)
    assert.match(controllerSource, /cancelStorageTransition\(\)/)
    assert.doesNotMatch(controllerSource, /确定清理 \$\{requests\.length\}/)
    assert.doesNotMatch(controllerSource, /modal: true,\s*\n\s*detail: detailParts/)
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
