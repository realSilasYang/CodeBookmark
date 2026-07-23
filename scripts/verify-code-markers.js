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

const javascript = [
  'const text = "// TODO: string literal"',
  'const TODO_value = true',
  '// TODO: first task',
  'run() // fixme repair this',
  '/* BUG: block issue */',
  'const template = `// TODO: template literal`',
  '/*',
  ' * TODO: multiline block',
  ' */',
  '// TODO one FIXME two BUG three',
]
const scan = scanCodeMarkers(javascript, 'typescript', 'sample.ts')
assert.equal(scan.truncated, false)
assert.deepEqual(scan.occurrences.map(item => [item.marker, item.line]), [
  ['TODO', 2],
  ['FIXME', 3],
  ['BUG', 4],
  ['TODO', 7],
  ['TODO', 9],
  ['FIXME', 9],
  ['BUG', 9],
])
assert.equal(scan.occurrences[0].label, 'TODO: first task')
assert.equal(scanCodeMarkers(['{"value":"TODO"}'], 'json', 'data.json').occurrences.length, 0)
assert.deepEqual(
  scanCodeMarkers(['value = "# TODO string"', '# BUG: python issue'], 'python', 'sample.py').occurrences.map(item => item.marker),
  ['BUG']
)
assert.deepEqual(
  scanCodeMarkers(['"""', 'TODO inside docstring', '"""', '# fixme: real marker'], 'python', 'sample.py').occurrences.map(item => item.marker),
  ['FIXME']
)
assert.deepEqual(
  scanCodeMarkers(['// TODO not valid CSS', '/* BUG: valid CSS */'], 'css', 'sample.css').occurrences.map(item => item.marker),
  ['BUG']
)
assert.deepEqual(
  scanCodeMarkers(['<div>TODO visible text</div>', '<!-- TODO: html comment -->'], 'html', 'sample.html').occurrences.map(item => item.marker),
  ['TODO']
)
const autohotkey = [
  'text := "; TODO inside string"',
  'value;TODO is not a comment delimiter without whitespace',
  '; TODO: line comment',
  'Run "app.exe" ; FIXME: inline comment',
  '/* BUG: one-line block */',
  '/* todo: multiline block',
  'still comment */',
]
assert.deepEqual(
  scanCodeMarkers(autohotkey, 'ahk', 'process-guard.ahk').occurrences.map(item => [item.marker, item.line]),
  [['TODO', 2], ['FIXME', 3], ['BUG', 4], ['TODO', 5]]
)
assert.deepEqual(
  scanCodeMarkers(['/* todo sdf'], 'plaintext', 'process-guard.ahk').occurrences.map(item => item.label),
  ['TODO: sdf']
)
assert.match(require('../out/util/CodeMarkerScanner').CODE_MARKER_FILE_GLOB, /ahk,ahk2/)
assert.equal(scanCodeMarkers(['// METHODTODO TODO_value'], 'typescript', 'sample.ts').occurrences.length, 0)
assert.equal(scanCodeMarkers(['// TODO one FIXME two'], 'typescript', 'limit.ts', 1).truncated, true)
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
assert.match(providerSource, /return runCodeMarkerDocumentSync\(document, this\.codeMarkerDocumentSyncPort\(\)\)/)
assert.match(providerSource, /await runCodeMarkerUriSync\(uris, this\.codeMarkerDocumentSyncPort\(\)\)/)
assert.match(providerSource, /runOpenCodeMarkerSync\(vscode\.workspace\.textDocuments, this\.codeMarkerDocumentSyncPort\(\)\)/)
assert.match(providerSource, /await runWorkspaceCodeMarkerScan\(scope, generation, MAX_BACKGROUND_CODE_MARKER_FILES, CODE_MARKER_SCAN_CONCURRENCY/)
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
assert.match(providerSource, /this\.languageCommentProfiles\.discoveryGlobs\(\)/)
assert.match(providerSource, /createFileSystemWatcher\(glob\)/)
assert.match(providerSource, /vscode\.extensions\.onDidChange/)
assert.match(providerSource, /this\.languageCommentProfiles\.reload\(\)/)
assert.match(providerSource, /await runCodeMarkerLanguageReload\(\{/)
assert.match(languageReloadSource, /await port\.reloadLanguageProfiles\(\)/)
assert.match(languageReloadSource, /port\.setupFileWatchers\(\)[\s\S]*?port\.resetWorkspaceScanScope\(\)[\s\S]*?await port\.synchronizeOpenDocuments\(\)[\s\S]*?port\.scheduleWorkspaceScan\(\)/)
assert.match(providerSource, /this\.isExcludedCodeMarkerUri\(uri\)[\s\S]*?this\.removeCodeMarkersForUri\(uri\)/)
assert.match(providerSource, /sourceIsMissing: uri => this\.codeMarkerSourceIsMissing\(uri\)/)
assert.match(editingRunnerSource, /changedBookmark\.icon = changedBookmark\.defaultIconName/)
assert.match(editingRunnerSource, /changedBookmark\.codeMarker\.iconCustomized = false/)
assert.match(editingRunnerSource, /const commonDefaultIcon = resolvedTargets\.every/)
assert.match(editingRunnerSource, /port\.showIconPicker\(initialIcon, commonDefaultIcon/)
assert.match(iconPickerSource, /shouldShowRestoreDefaultIcon\(this\._currentIcon, this\._defaultIcon\)/)
assert.match(iconPickerSource, /recentIcons\.length > 0 \|\| showRestoreDefault/)
assert.match(iconPickerSource, /command: 'restoreDefaultIcon'/)
assert.match(iconPickerSource, /this\._onDidSelectIcon\(this\._defaultIcon, this\._bookmarkId\)/)
assert.match(subscriberSource, /onDidOpenTextDocument/)

const { loadLocalizedManifest } = require('./localized-manifest')
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
assert.match(repositorySource, /SOURCE_SCAN_EXCLUDED_DIRECTORIES/)
