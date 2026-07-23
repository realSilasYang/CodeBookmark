const assert = require('node:assert/strict')
const fs = require('node:fs')

const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const repository = fs.readFileSync('src/repository/BookmarkRepository.ts', 'utf8')
const iconPicker = fs.readFileSync('src/util/quick_pick_icon/IconPickerWebview.ts', 'utf8')

assert.equal(provider.includes('ExtensionConfig.defaultExpandLevel'), true)
assert.equal(iconPicker.includes('Content-Security-Policy'), true)
assert.equal(iconPicker.includes('webview.cspSource'), true)
assert.equal(iconPicker.includes('nonce="${nonce}"'), true)
assert.equal(iconPicker.includes('onclick='), false)
assert.ok(provider.split(/\r?\n/).length <= 1_800, 'View Provider exceeded its composition-root size budget')
assert.ok(repository.split(/\r?\n/).length <= 1_450, 'BookmarkRepository exceeded its repository-facade size budget')
for (const boundary of [
  'SourceCandidateIndex',
  'ScriptEnvelopeCodec',
  'BookmarkFileNodeCodec',
  'BookmarkConfigurationImportScanner',
]) {
  assert.match(repository, new RegExp(`from './${boundary}'`))
}
assert.doesNotMatch(repository, /MAX_IMPORT_CONFIGURATION_ENTRIES|serializedPathsMatchScript/)
assert.match(provider, /new CodeMarkerWorkflowController\(\{/)
assert.doesNotMatch(provider, /CodeMarkerSnapshotCoordinator|CodeMarkerSourceReader|CodeMarkerSyncLifecycle/)
