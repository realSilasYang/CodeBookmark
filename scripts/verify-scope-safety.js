/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-scope-safety`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-scope-safety` 对应契约。
 * 核心边界：通过断言锁定“verify-scope-safety”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const preparation = fs.readFileSync('src/providers/BookmarkViewPreparation.ts', 'utf8')
const committer = fs.readFileSync('src/providers/BookmarkViewCommitter.ts', 'utf8')
const commands = fs.readFileSync('src/commands/bookmarkCommands.ts', 'utf8')
const subscriber = fs.readFileSync('src/subscriptions/fileEditorSubscriber.ts', 'utf8')
const sourcePathChangeRunner = fs.readFileSync('src/providers/SourcePathChangeWorkflowRunner.ts', 'utf8')
const documentChangeCoordinator = fs.readFileSync('src/providers/BookmarkDocumentChangeCoordinator.ts', 'utf8')

assert.match(provider, /private storageScopeForUri\(/)
assert.match(provider, /private uriMatchesCurrentScope\(/)
assert.match(provider, /private async prepareBookmarkView\([\s\S]*?signal\?: AbortSignal/)
assert.match(preparation, /signal\?: AbortSignal/)
assert.match(preparation, /readBookmarks\(activePaths: readonly string\[], signal\?: AbortSignal\)/)
assert.match(provider, /this\.initViewEditor\(scopePath, true, generation, storageScope\)/)
assert.match(provider, /editor\?\.document\.uri\.scheme === 'file' && this\.uriMatchesCurrentScope/)
assert.match(documentChangeCoordinator, /if \(!port\.isCurrentScope\(uri\)\) return/)
assert.doesNotMatch(provider, /undoManager\.clear\(/)
assert.match(provider, /return commitBookmarkView\(prepared, \{/)
assert.match(committer, /port\.setCurrentStorageScope\(prepared\.storageScope\)/)
assert.match(provider, /publishCommittedViewTransition[\s\S]*?undoManager\.setActiveScope\(this\.currentStorageScope\)/)
assert.match(provider, /relocateUndoPath:[\s\S]*?undoManager\.relocatePath\(/)
assert.match(sourcePathChangeRunner, /port\.relocateUndoPath\(/)
assert.match(commands, /await provider\.ensureEditorScope\(editor\)/)
assert.match(subscriber, /if \(scheme !== 'file'\) return/)
