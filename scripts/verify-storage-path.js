const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolveStoragePath } = require('../out/util/StoragePath')
const {
  canonicalBookmarkPath,
  bookmarkPathKey,
  isSameOrDescendantBookmarkPath,
  renamedBookmarkPath,
} = require('../out/util/BookmarkPath')
const { createBookmarkId, createOperationId, createScriptId, isScriptId } = require('../out/util/ScriptIdentity')
const { storageRootState } = require('../out/util/StorageRootState')

process.env.CODEBOOKMARK_VERIFY_ROOT = path.join(os.tmpdir(), 'codebookmark-storage')
assert.equal(resolveStoragePath('  %CODEBOOKMARK_VERIFY_ROOT%  '), path.normalize(process.env.CODEBOOKMARK_VERIFY_ROOT))
assert.equal(resolveStoragePath('~/bookmarks'), path.normalize(path.join(os.homedir(), '/bookmarks')))
assert.throws(() => resolveStoragePath('%CODEBOOKMARK_MISSING_ENV%'), /环境变量未定义/)

assert.equal(canonicalBookmarkPath('src\\feature\\..\\main.ts'), 'src/main.ts')
assert.equal(bookmarkPathKey('SRC\\main.ts'), 'SRC/main.ts')
assert.notEqual(bookmarkPathKey('SRC/main.ts'), bookmarkPathKey('src/main.ts'))
assert.notEqual(bookmarkPathKey('cafe\u0301.ts'), bookmarkPathKey('caf\u00e9.ts'))
assert.equal(isSameOrDescendantBookmarkPath('src/main.ts', ''), true)
assert.equal(renamedBookmarkPath('src/main.ts', '', 'renamed'), 'renamed/src/main.ts')
assert.equal(renamedBookmarkPath('src/main.ts', 'src', ''), 'main.ts')
assert.equal(isScriptId(createScriptId()), true)
assert.equal(isScriptId('10000000-0000-9000-1000-000000000001'), true)
const generatedIdentities = new Set()
for (let index = 0; index < 1000; index++) {
	generatedIdentities.add(createScriptId())
	generatedIdentities.add(createBookmarkId())
	generatedIdentities.add(createOperationId())
}
assert.equal(generatedIdentities.size, 3000)

storageRootState.clear()
storageRootState.activate(path.join(os.tmpdir(), 'source-bookmarks'))
const sourceGeneration = storageRootState.generation
storageRootState.activate(path.join(os.tmpdir(), 'target-bookmarks'))
assert.equal(storageRootState.generation, sourceGeneration + 1)

const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const rootActivator = fs.readFileSync('src/providers/StorageRootActivator.ts', 'utf8')
const storagePathWorkflow = fs.readFileSync('src/providers/BookmarkStoragePathWorkflowRunner.ts', 'utf8')
const activationStart = provider.indexOf('private async ensureActiveStorageRoot()')
const activationEnd = provider.indexOf('\n\trefreshDecoration(', activationStart)
const activation = provider.slice(activationStart, activationEnd)
assert.ok(activationStart >= 0 && activationEnd > activationStart)
assert.match(activation, /return ensureStorageRootActive\(\{/)
assert.match(activation, /rememberedRoot: \(\) => this\.context\.globalState\.get<string>\(LAST_STORAGE_ROOT_KEY\)/)
assert.match(activation, /transferRoot: async \(source, target\) => \{ await transferStorageRoot\(source, target\) \}/)
assert.match(activation, /rememberRoot: async root => \{ await this\.context\.globalState\.update\(LAST_STORAGE_ROOT_KEY, root\) \}/)
assert.match(activation, /当前书签存储路径无效，已继续使用上次验证成功的目录/)
assert.match(activation, /目标书签存储目录尚未启用，已继续使用来源目录/)
assert.match(activation, /书签存储目录已转移且原目录已清理，但记录新目录失败/)
assert.doesNotMatch(activation, /if \(!ExtensionConfig\.ensureGlobalStoragePathConfigured\(\)\)/)
assert.match(rootActivator, /const rememberedRoot = port\.rememberedRoot\(\)/)
assert.match(rootActivator, /if \(!port\.ensureConfigured\(\)\)/)
assert.match(rootActivator, /const previousRoot = port\.activeRoot\(\) \?\? rememberedRoot/)
assert.match(rootActivator, /await port\.transferRoot\(previousRoot, configuredRoot\)/)
assert.match(rootActivator, /port\.activateRoot\(previousRoot\)[\s\S]*?port\.reportTransferFailure\(error\)[\s\S]*?port\.showTransferFailure\(error\)/)
assert.match(rootActivator, /port\.activateRoot\(configuredRoot\)[\s\S]*?await port\.rememberRoot\(configuredRoot\)/)

const transitionStart = storagePathWorkflow.indexOf('private async perform(')
const snapshotSource = storagePathWorkflow.indexOf('port.queueFullSave()', transitionStart)
const markTransition = storagePathWorkflow.indexOf('port.beginStorageTransition()', transitionStart)
const flushSource = storagePathWorkflow.indexOf('await port.flushPendingSaves(true)', transitionStart)
const transfer = storagePathWorkflow.indexOf('await port.transferRoot(sourceRoot, targetRoot)', transitionStart)
const activateTarget = storagePathWorkflow.indexOf('port.activateRoot(targetRoot)', transfer)
assert.ok(transitionStart >= 0
	&& snapshotSource > transitionStart
	&& markTransition > snapshotSource
	&& flushSource > markTransition
	&& transfer > flushSource
	&& activateTarget > transfer)
assert.match(storagePathWorkflow.slice(transitionStart), /port\.activateRoot\(transferCompleted \? targetRoot : sourceRoot\)/)
assert.match(storagePathWorkflow.slice(transitionStart), /port\.finishStorageTransition\(\)/)
assert.match(storagePathWorkflow.slice(transitionStart), /port\.cancelStorageTransition\(\)/)
assert.match(provider, /return this\.storagePathWorkflow\.run\(this\.bookmarkStoragePathWorkflowPort\(\)\)/)
