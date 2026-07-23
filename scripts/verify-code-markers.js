/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-code-markers`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-code-markers` 对应契约。
 * 核心边界：通过断言锁定“verify-code-markers”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`occurrence`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}
class MarkdownString {
  appendMarkdown() {}
  appendText() {}
  appendCodeblock() {}
}

const vscodeMock = {
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(id, color) { this.id = id; this.color = color }
  },
  ThemeColor: class {},
  MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    getConfiguration: section => ({
      get: key => {
        if (section === 'codebookmark' && key === 'autoSpace') return true
        return undefined
      },
    }),
  },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
  },
  commands: { executeCommand: async () => undefined },
}

installModuleMocks({ vscode: vscodeMock })

const { Bookmark, CursorIndex } = require('../out/models/Bookmark')
const { BookmarkSet } = require('../out/models/BookmarkSet')
const {
  CODE_MARKER_ICON,
  scanCodeMarkers,
} = require('../out/util/CodeMarkerScanner')
const { synchronizeCodeMarkerBookmarks } = require('../out/util/CodeMarkerBookmarks')
const { ContextBookmark } = require('../out/util/ContextValue')
const {
  SOURCE_SCAN_EXCLUDE_GLOB,
  isExcludedSourceRelativePath,
} = require('../out/util/SourceFilePolicy')

function occurrence(marker, line, column, label, lineText) {
  return { marker, line, column, label, lineText }
}

const cLikeProfile = { lineComments: [{ value: '//' }], blockComments: [['/*', '*/']] }
const hashProfile = { lineComments: [{ value: '#' }], blockComments: [] }
const cssProfile = { lineComments: [], blockComments: [['/*', '*/']] }
const markupProfile = { lineComments: [], blockComments: [['<!--', '-->']] }
const autohotkeyProfile = { lineComments: [{ value: ';' }], blockComments: [['/*', '*/']] }

const javascript = [
  'const text = "// TODO: string literal"',
  'const TODO_value = true',
  '// TODO: first task',
  'run() // FIXME: repair this',
  '/* BUG: block issue */',
  'const template = `// TODO: template literal`',
  '/*',
  ' * TODO: multiline block',
  ' */',
]
const scan = scanCodeMarkers(javascript, 'typescript', 'sample.ts', 100, cLikeProfile)
assert.equal(scan.truncated, false)
assert.deepEqual(scan.occurrences.map(item => [item.marker, item.line]), [
  ['TODO', 2],
  ['FIXME', 3],
  ['BUG', 4],
  ['TODO', 7],
])
assert.equal(scan.occurrences[0].label, 'TODO: first task')
assert.equal(scanCodeMarkers(['{"value":"TODO"}'], 'json', 'data.json').occurrences.length, 0)
assert.deepEqual(
  scanCodeMarkers(['value = "# TODO string"', '# BUG: python issue'], 'python', 'sample.py', 100, hashProfile).occurrences.map(item => item.marker),
  ['BUG']
)
assert.deepEqual(
  scanCodeMarkers(['"""', '# TODO inside docstring', '"""', '# FIXME: real marker'], 'python', 'sample.py', 100, hashProfile).occurrences.map(item => item.marker),
  ['FIXME']
)
assert.deepEqual(
  scanCodeMarkers(['// TODO not valid CSS', '/* BUG: valid CSS */'], 'css', 'sample.css', 100, cssProfile).occurrences.map(item => item.marker),
  ['BUG']
)
assert.deepEqual(
  scanCodeMarkers(['<div>TODO visible text</div>', '<!-- TODO: html comment -->'], 'html', 'sample.html', 100, markupProfile).occurrences.map(item => item.marker),
  ['TODO']
)
const incidentalMarkerWords = [
  '// Automatic TODO/FIXME/BUG bookmarks are synchronized from comment tokens.',
  '// This TODO item mentions a FIXME and a BUG in prose.',
  '// TODO one FIXME two BUG three',
  '/* Security Bug / Vulnerability */',
]
assert.equal(scanCodeMarkers(incidentalMarkerWords, 'typescript', 'prose.ts', 100, cLikeProfile).occurrences.length, 0)
assert.equal(
  scanCodeMarkers([
    '<!-- Minimalist Flat Code Bug -->',
    '<!-- TODO Icon Metadata -->',
    '<!-- FIXME Icon Metadata -->',
    '<!-- BUG Icon Metadata -->',
  ], 'xml', 'status_bug.svg', 100, markupProfile).occurrences.length,
  0,
)
const explicitDirectives = scanCodeMarkers([
  '// @TODO first',
  '// [FIXME] second',
  '/** BUG: third */',
  '// TODO',
  '// FIXME - fifth',
  '// BUG(owner): sixth',
  '// TODO：第七项',
  '// todo: eighth',
  '// @fixme ninth',
  '// [bug] tenth',
], 'typescript', 'directives.ts', 100, cLikeProfile).occurrences
assert.deepEqual(
  explicitDirectives.map(item => item.marker),
  ['TODO', 'FIXME', 'BUG', 'TODO', 'FIXME', 'BUG', 'TODO', 'TODO', 'FIXME', 'BUG'],
)
assert.deepEqual(
  explicitDirectives.map(item => item.label),
  [
    'TODO: first', 'FIXME: second', 'BUG: third', 'TODO', 'FIXME: fifth',
    'BUG: (owner): sixth', 'TODO: 第七项', 'TODO: eighth', 'FIXME: ninth', 'BUG: tenth',
  ],
)
assert.equal(
  scanCodeMarkers(['// todo item in prose', '// fixme note in prose', '// bug icon metadata'], 'typescript', 'lower.ts', 100, cLikeProfile).occurrences.length,
  0,
)
const iconMetadataFalsePositives = fs.readdirSync('resources/custom_icons')
  .filter(fileName => fileName.endsWith('.svg'))
  .flatMap(fileName => {
    const lines = fs.readFileSync(`resources/custom_icons/${fileName}`, 'utf8').split(/\r\n|\n|\r/)
    return scanCodeMarkers(lines, 'xml', fileName, 100, markupProfile).occurrences
      .map(item => `${fileName}:${item.line + 1}:${item.marker}`)
  })
assert.deepEqual(iconMetadataFalsePositives, [])
const repositoryProseFalsePositives = [
  ['src/util/FileUtils.ts', 'typescript', cLikeProfile],
  ['src/util/CodeMarkerScanner.ts', 'typescript', cLikeProfile],
  ['README.md', 'markdown', markupProfile],
  ['docs/README.en.md', 'markdown', markupProfile],
].flatMap(([fileName, languageId, profile]) => {
  const lines = fs.readFileSync(fileName, 'utf8').split(/\r\n|\n|\r/)
  return scanCodeMarkers(lines, languageId, fileName, 100, profile).occurrences
    .map(item => `${fileName}:${item.line + 1}:${item.marker}:${item.label}`)
})
assert.deepEqual(repositoryProseFalsePositives, [])
const autohotkey = [
  'text := "; TODO inside string"',
  'value;TODO is not a comment delimiter without whitespace',
  '; TODO: line comment',
  'Run "app.exe" ; FIXME: inline comment',
  '/* BUG: one-line block */',
  '/* TODO: multiline block',
  'still comment */',
]
assert.deepEqual(
  scanCodeMarkers(autohotkey, 'ahk', 'process-guard.ahk', 100, autohotkeyProfile).occurrences.map(item => [item.marker, item.line]),
  [['TODO', 2], ['FIXME', 3], ['BUG', 4], ['TODO', 5]]
)
assert.equal(scanCodeMarkers(['/* TODO: not highlighted'], 'plaintext', 'process-guard.ahk').occurrences.length, 0)
assert.equal(scanCodeMarkers(['// METHODTODO TODO_value'], 'typescript', 'sample.ts', 100, cLikeProfile).occurrences.length, 0)
assert.equal(scanCodeMarkers(['// TODO: first', '// FIXME: second'], 'typescript', 'limit.ts', 1, cLikeProfile).truncated, true)
assert.equal(isExcludedSourceRelativePath('.history/example_20260717223142.ahk'), true)
assert.equal(isExcludedSourceRelativePath('src/history-service.ts'), false)
assert.match(SOURCE_SCAN_EXCLUDE_GLOB, /\.history/)
assert.equal(CODE_MARKER_ICON, 'status_idea_yellow.svg')
assert.equal(fs.existsSync(`resources/custom_icons/${CODE_MARKER_ICON}`), true)

const root = new BookmarkSet()
const pathRel = 'src/sample.ts'
const initialLines = ['const a = 1', '// TODO: original', 'const b = 2', '// BUG: remove me']
const initial = synchronizeCodeMarkerBookmarks(root, pathRel, initialLines, [
  occurrence('TODO', 1, 3, 'TODO: original', initialLines[1]),
  occurrence('BUG', 3, 3, 'BUG: remove me', initialLines[3]),
])
assert.equal(initial.changed, true)
assert.equal(initial.created, 2)
const fileNode = root.values[0]
assert.equal(fileNode.subs.size, 2)
assert.equal(fileNode.subs.values.every(bookmark => bookmark.icon === CODE_MARKER_ICON && bookmark.isCodeMarker), true)
const todo = fileNode.subs.values[0]
assert.equal(todo.contextValue, ContextBookmark.CodeMarkerDefault)
assert.equal(todo.codeMarker.iconCustomized, false)
const originalTodoId = todo.id

const manual = new Bookmark({
  label: 'manual bookmark',
  path: pathRel,
  content: 'const b = 2',
  start: new CursorIndex(2, 0),
  end: new CursorIndex(2, 0),
  parent: fileNode,
})
fileNode.subs.add(manual)
const nestedManual = new Bookmark({
  label: 'nested manual bookmark',
  path: pathRel,
  content: 'const a = 1',
  start: new CursorIndex(0, 0),
  end: new CursorIndex(0, 0),
  parent: todo,
})
todo.subs.add(nestedManual)
todo.label = 'custom TODO label'
todo.icon = 'status_idea_red.svg'
todo.codeMarker.iconCustomized = true
todo.isPinned = true
todo.refreshDisplayProps()
assert.equal(todo.contextValue, ContextBookmark.CodeMarkerPinnedCustom)

const updatedLines = ['// TODO: renamed and moved', 'const a = 1', '// FIXME: new issue', 'const b = 2']
const updated = synchronizeCodeMarkerBookmarks(root, pathRel, updatedLines, [
  occurrence('TODO', 0, 3, 'TODO: renamed and moved', updatedLines[0]),
  occurrence('FIXME', 2, 3, 'FIXME: new issue', updatedLines[2]),
])
assert.equal(updated.created, 1)
assert.equal(updated.removed, 1)
assert.equal(fileNode.subs.values[0].id, originalTodoId)
assert.equal(fileNode.subs.values[0].label, 'custom TODO label')
assert.equal(fileNode.subs.values[0].start.line, 0)
assert.equal(fileNode.subs.values[0].icon, 'status_idea_red.svg')
assert.equal(fileNode.subs.values[0].isPinned, true)
assert.equal(fileNode.subs.values[0].contextValue, ContextBookmark.CodeMarkerPinnedCustom)
assert.deepEqual(fileNode.subs.values.slice(0, 2).map(bookmark => bookmark.codeMarker.marker), ['TODO', 'FIXME'])
assert.equal(fileNode.subs.values.includes(manual), true)
assert.equal(fileNode.subs.values.includes(nestedManual), true)
assert.equal(nestedManual.parent, fileNode)

const restored = Bookmark.fromJSON(fileNode.subs.values[0].toJSON())
assert.equal(restored.codeMarker.marker, 'TODO')
assert.equal(restored.icon, 'status_idea_red.svg')
assert.equal(restored.codeMarker.iconCustomized, true)
assert.equal(restored.contextValue, ContextBookmark.CodeMarkerPinnedCustom)

const removed = synchronizeCodeMarkerBookmarks(root, pathRel, updatedLines, [])
assert.equal(removed.removed, 2)
assert.equal(root.values.length, 1)
assert.equal(root.values[0].subs.values.some(bookmark => bookmark.isCodeMarker), false)
assert.equal(root.values[0].subs.values.includes(manual), true)
assert.equal(root.values[0].subs.values.includes(nestedManual), true)

const staleProseRoot = new BookmarkSet()
const staleProseLine = '// Automatic TODO/FIXME/BUG bookmarks are synchronized from comment tokens.'
synchronizeCodeMarkerBookmarks(staleProseRoot, 'src/util/FileUtils.ts', [staleProseLine], [
  occurrence('TODO', 0, 13, 'TODO: /', staleProseLine),
  occurrence('FIXME', 0, 18, 'FIXME: /', staleProseLine),
  occurrence('BUG', 0, 24, 'BUG: bookmarks are synchronized from comment tokens.', staleProseLine),
])
assert.equal(staleProseRoot.values[0].subs.size, 3)
const currentProseScan = scanCodeMarkers(
  [staleProseLine],
  'typescript',
  'src/util/FileUtils.ts',
  100,
  cLikeProfile,
)
assert.deepEqual(currentProseScan.occurrences, [])
const staleProseCleanup = synchronizeCodeMarkerBookmarks(
  staleProseRoot,
  'src/util/FileUtils.ts',
  [staleProseLine],
  currentProseScan.occurrences,
)
assert.equal(staleProseCleanup.removed, 3)
assert.equal(staleProseRoot.size, 0)

const automaticOnly = new BookmarkSet()
synchronizeCodeMarkerBookmarks(automaticOnly, 'only.ts', ['// TODO'], [occurrence('TODO', 0, 3, 'TODO', '// TODO')])
assert.equal(automaticOnly.size, 1)
synchronizeCodeMarkerBookmarks(automaticOnly, 'only.ts', ['// TODO: updated'], [occurrence('TODO', 0, 3, 'TODO: updated', '// TODO: updated')])
assert.equal(automaticOnly.values[0].subs.values[0].label, 'TODO: updated')
synchronizeCodeMarkerBookmarks(automaticOnly, 'only.ts', [''], [])
assert.equal(automaticOnly.size, 0)

const largeRoot = new BookmarkSet()
const largeLines = Array.from({ length: 5000 }, (_, line) => `// TODO: task ${line}`)
const largeOccurrences = largeLines.map((lineText, line) => occurrence('TODO', line, 3, `TODO: task ${line}`, lineText))
synchronizeCodeMarkerBookmarks(largeRoot, 'large.ts', largeLines, largeOccurrences)
const largeIds = largeRoot.values[0].subs.values.map(bookmark => bookmark.id)
const largeRepeat = synchronizeCodeMarkerBookmarks(largeRoot, 'large.ts', largeLines, largeOccurrences)
assert.equal(largeRepeat.changed, false)
assert.deepEqual(largeRoot.values[0].subs.values.map(bookmark => bookmark.id), largeIds)

const excludedRoot = new BookmarkSet()
synchronizeCodeMarkerBookmarks(excludedRoot, '.history/example_20260717223142.ahk', ['; TODO excluded snapshot'], [
  occurrence('TODO', 0, 2, 'TODO excluded snapshot', '; TODO excluded snapshot'),
])
synchronizeCodeMarkerBookmarks(excludedRoot, 'example.ahk', ['; TODO current'], [
  occurrence('TODO', 0, 2, 'TODO current', '; TODO current'),
])
assert.equal(excludedRoot.size, 2)
for (const fileNode of [...excludedRoot.values]) {
  if (isExcludedSourceRelativePath(fileNode.path)) {
    synchronizeCodeMarkerBookmarks(excludedRoot, fileNode.path, [], [])
  }
}
assert.deepEqual(excludedRoot.values.map(fileNode => fileNode.path), ['example.ahk'])

const providerSource = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const workflowControllerSource = fs.readFileSync('src/providers/CodeMarkerWorkflowController.ts', 'utf8')
const editingRunnerSource = fs.readFileSync('src/providers/BookmarkEditingWorkflowRunner.ts', 'utf8')
const deletionRunnerSource = fs.readFileSync('src/providers/BookmarkDeletionWorkflowRunner.ts', 'utf8')
const treeInteractionRunnerSource = fs.readFileSync('src/providers/BookmarkTreeInteractionRunner.ts', 'utf8')
const documentSyncSource = fs.readFileSync('src/providers/CodeMarkerDocumentSync.ts', 'utf8')
const workspaceScanSource = fs.readFileSync('src/providers/WorkspaceCodeMarkerScanRunner.ts', 'utf8')
const languageReloadSource = fs.readFileSync('src/providers/CodeMarkerLanguageReloadRunner.ts', 'utf8')
const backgroundRunnerSource = fs.readFileSync('src/providers/BackgroundEnhancementRunner.ts', 'utf8')
const documentChangeCoordinatorSource = fs.readFileSync('src/providers/BookmarkDocumentChangeCoordinator.ts', 'utf8')
const iconPickerSource = fs.readFileSync('src/util/quick_pick_icon/IconPickerWebview.ts', 'utf8')
const subscriberSource = fs.readFileSync('src/subscriptions/fileEditorSubscriber.ts', 'utf8')
assert.match(documentChangeCoordinatorSource, /const markerResult = port\.synchronizeCodeMarkers/)
assert.doesNotMatch(documentChangeCoordinatorSource, /if \(port\.bookmarkCount\(bookmarkPath\) === 0\) return/)
assert.match(treeInteractionRunnerSource, /if \(first\.isCodeMarker !== second\.isCodeMarker\) return first\.isCodeMarker \? -1 : 1/)
assert.match(providerSource, /synchronizeOpenCodeMarkerDocuments: \(\) => this\.synchronizeOpenCodeMarkerDocuments\(\)/)
assert.match(providerSource, /return this\.codeMarkerWorkflow\.syncDocument\(document\)/)
assert.match(providerSource, /await this\.codeMarkerWorkflow\.syncUris\(uris\)/)
assert.match(workflowControllerSource, /return synchronizeCodeMarkersInDocument\(document, this\.documentSyncPort\(\)\)/)
assert.match(workflowControllerSource, /await synchronizeCodeMarkersForUris\(uris, this\.documentSyncPort\(\)\)/)
assert.match(workflowControllerSource, /synchronizeOpenCodeMarkerDocuments\(vscode\.workspace\.textDocuments, this\.documentSyncPort\(\)\)/)
assert.match(workflowControllerSource, /await scanWorkspaceCodeMarkers\(scope, generation, MAX_BACKGROUND_CODE_MARKER_FILES, CODE_MARKER_SCAN_CONCURRENCY/)
assert.match(workspaceScanSource, /const discoveredByPath = new Map<string, Uri>\(\)/)
assert.match(workspaceScanSource, /await Promise\.all\(Array\.from\(\{ length: Math\.min\(concurrency, uris\.length\)/)
assert.match(workspaceScanSource, /port\.sourceIsMissing\(uri\)/)
assert.match(workspaceScanSource, /port\.measure\(startedAt, uris\.length, changedPaths\.length\)/)
assert.match(documentSyncSource, /await port\.initializeLanguageProfiles\(\)/)
assert.match(documentSyncSource, /if \(viewGeneration !== port\.currentGeneration\(\)\) return/)
assert.match(documentSyncSource, /port\.persistChanges\(changedPaths\)/)
assert.match(providerSource, /runBackgroundEnhancements\(languageProfilesReady, scope, viewGeneration, startedAt/)
assert.match(backgroundRunnerSource, /await port\.synchronizeOpenCodeMarkerDocuments\(\)/)
assert.match(backgroundRunnerSource, /port\.scheduleWorkspaceCodeMarkerScan\(\)/)
assert.match(workflowControllerSource, /this\.profiles\.discoveryGlobs\(\)/)
assert.match(workflowControllerSource, /createFileSystemWatcher\(glob\)/)
assert.match(providerSource, /vscode\.extensions\.onDidChange/)
assert.match(workflowControllerSource, /this\.profiles\.reload\(\)/)
assert.match(workflowControllerSource, /await reloadCodeMarkerLanguageProfiles\(\{/)
assert.match(languageReloadSource, /await port\.reloadLanguageProfiles\(\)/)
assert.match(languageReloadSource, /port\.setupFileWatchers\(\)[\s\S]*?port\.resetWorkspaceScanScope\(\)[\s\S]*?await port\.synchronizeOpenDocuments\(\)[\s\S]*?port\.scheduleWorkspaceScan\(\)/)
assert.match(workflowControllerSource, /isExcluded: uri => this\.isExcluded\(uri\)/)
assert.match(workflowControllerSource, /removeMarkers: uri => this\.removeMarkers\(uri\)/)
assert.match(workflowControllerSource, /sourceIsMissing: uri => this\.sourceIsMissing\(uri\)/)
assert.match(editingRunnerSource, /changedBookmark\.icon = changedBookmark\.defaultIconName/)
assert.match(editingRunnerSource, /changedBookmark\.codeMarker\.iconCustomized = false/)
assert.match(editingRunnerSource, /const commonDefaultIcon = resolvedTargets\.every/)
assert.match(editingRunnerSource, /port\.showIconPicker\(initialIcon, commonDefaultIcon/)
assert.match(iconPickerSource, /shouldShowRestoreDefaultIcon\(this\._currentIcon, this\._defaultIcon\)/)
assert.match(iconPickerSource, /recentIcons\.length > 0 \|\| showRestoreDefault/)
assert.match(iconPickerSource, /command: 'restoreDefaultIcon'/)
assert.match(iconPickerSource, /this\._onDidSelectIcon\(this\._defaultIcon, this\._bookmarkId\)/)
assert.match(subscriberSource, /onDidOpenTextDocument/)

const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const restoreMenu = manifest.contributes.menus['view/item/context']
  .find(item => item.command === 'codebookmark.editBookmark.restoreDefaultIcon')
assert.match(restoreMenu.when, /bookmarkCodeMarkerCustom/)
assert.match(restoreMenu.when, /bookmarkCodeMarkerPinnedCustom/)
assert.doesNotMatch(restoreMenu.when, /bookmarkCodeMarkerDefault/)
assert.doesNotMatch(restoreMenu.when, /bookmarkCodeMarkerPinnedDefault/)
const deleteMenu = manifest.contributes.menus['view/item/context']
  .find(item => item.command === 'codebookmark.deleteBookmark')
assert.doesNotMatch(deleteMenu.when, /bookmarkCodeMarker/)
assert.match(providerSource, /private bookmarkContainsCodeMarker\(/)
assert.match(providerSource, /TODO\/FIXME\/BUG .*不可删除/)
assert.match(deletionRunnerSource, /targets = targets\.filter\(target => !port\.bookmarkContainsCodeMarker\(target\)\)/)
const manualBookmarkRunner = fs.readFileSync('src/providers/ManualBookmarkWorkflowRunner.ts', 'utf8')
assert.match(manualBookmarkRunner, /for \(const id of idsToDelete\)[\s\S]*?bookmarkContainsCodeMarker\(bookmark\)/)

const repositorySource = fs.readFileSync('src/repository/BookmarkRepository.ts', 'utf8')
const importScannerSource = fs.readFileSync('src/repository/BookmarkConfigurationImportScanner.ts', 'utf8')
assert.match(repositorySource, /collectBookmarkConfigurationImportCandidates\(configFolderPath, workspaceRootPath\)/)
assert.match(importScannerSource, /SOURCE_SCAN_EXCLUDED_DIRECTORIES/)
