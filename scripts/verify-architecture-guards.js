/**
 * 锁定核心模块的职责边界、文件规模和禁止依赖，防止拆分后的逻辑重新回流到大型提供器。
 * 脚本读取仓库真实文件，围绕“锁定核心模块的职责边界、文件规模和禁止依赖”核对结构和调用顺序，不复制一份实现来验证自己。
 */
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
]) {
  assert.match(repository, new RegExp(`from './${boundary}'`))
}
assert.doesNotMatch(repository, /MAX_IMPORT_CONFIGURATION_ENTRIES|serializedPathsMatchScript/)
assert.match(provider, /new CodeMarkerWorkflowController\(\{/)
assert.doesNotMatch(provider, /CodeMarkerSnapshotCoordinator|CodeMarkerSourceReader|CodeMarkerSyncLifecycle/)
