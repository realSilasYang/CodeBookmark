/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-architecture-guards`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-architecture-guards` 对应契约。
 * 核心边界：通过断言锁定“verify-architecture-guards”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
  'BookmarkConfigurationImportScanner',
]) {
  assert.match(repository, new RegExp(`from './${boundary}'`))
}
assert.doesNotMatch(repository, /MAX_IMPORT_CONFIGURATION_ENTRIES|serializedPathsMatchScript/)
assert.match(provider, /new CodeMarkerWorkflowController\(\{/)
assert.doesNotMatch(provider, /CodeMarkerSnapshotCoordinator|CodeMarkerSourceReader|CodeMarkerSyncLifecycle/)
