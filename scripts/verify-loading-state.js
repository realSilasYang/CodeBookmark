/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-loading-state`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-loading-state` 对应契约。
 * 核心边界：通过断言锁定“verify-loading-state”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const finalizer = fs.readFileSync('src/providers/ViewLoadFinalizer.ts', 'utf8')
const watcherLifecycle = fs.readFileSync('src/providers/ConfigWatcherLifecycle.ts', 'utf8')
const watcherCoordinator = fs.readFileSync('src/providers/BookmarkConfigWatcherCoordinator.ts', 'utf8')
const extension = fs.readFileSync('src/extension.ts', 'utf8')
const refreshCoordinator = fs.readFileSync('src/providers/BookmarkViewRefreshCoordinator.ts', 'utf8')
const treeViewLifecycle = fs.readFileSync('src/providers/BookmarkTreeViewLifecycle.ts', 'utf8')

assert.equal(
  manifest.contributes.viewsWelcome[0].when,
  'bookmarks.var.bookmark.loaded && !bookmarks.var.bookmark.loadFailed && codebookmark.aiAnalysisAvailable && !codebookmark.activeFileHasBookmark'
)
assert.match(manifest.contributes.viewsWelcome[0].contents, /导入书签配置文件/)
assert.match(manifest.contributes.viewsWelcome[0].contents, /暂无书签，按下 Ctrl\+B 即刻添加！/)
assert.doesNotMatch(manifest.contributes.viewsWelcome[0].contents, /将光标插入需要添加书签的位置/)
assert.match(manifest.contributes.viewsWelcome[0].contents, /导入书签配置文件[\s\S]*查看使用说明/)
assert.match(manifest.contributes.viewsWelcome[0].contents, /command:codebookmark\.importBookmarkConfig/)
assert.doesNotMatch(manifest.contributes.viewsWelcome[0].contents, /\$\{commands\./)
assert.equal(manifest.contributes.viewsWelcome[1].when,
  'bookmarks.var.bookmark.loaded && !bookmarks.var.bookmark.loadFailed && !codebookmark.aiAnalysisAvailable')
assert.equal(extension.includes("Commands.varBookmarkLoaded, false"), true)

const initStart = provider.indexOf('async initViewEditor(')
const initEnd = provider.indexOf('\n\tprivate async ensureActiveStorageRoot(', initStart)
const initBody = provider.slice(initStart, initEnd)
assert.ok(initStart >= 0 && initEnd > initStart)
assert.match(initBody, /if \(!preserveLoadedContext\) await this\.setContextValue\(Commands\.varBookmarkLoaded, false\)/)
assert.match(initBody, /generation = this\.beginViewLoad\(\)/)
assert.match(initBody, /const signal = this\.viewLoadSignal\(generation\)/)
assert.ok((initBody.match(/generation !== this\.viewLoadGeneration/g) || []).length >= 1)
assert.match(initBody, /const pipeline = await runViewLoadPipeline\(generation, \{/)
assert.match(initBody, /prepare: \(\) => this\.prepareBookmarkView/)
assert.match(initBody, /commit: next => this\.commitPreparedBookmarkView\(next\)/)
assert.match(initBody, /publish: \(next, candidateGeneration\) => this\.publishCommittedViewTransition\(next, candidateGeneration\)/)
assert.match(initBody, /await finalizeViewLoad\(\{/)
assert.match(initBody, /loadFailure: pipeline\.loadFailure/)
assert.match(initBody, /setLoadFailedContext: failed => this\.setContextValue\(Commands\.varBookmarkLoadFailed, failed\)/)
assert.match(initBody, /setLoadedContext: \(\) => this\.setContextValue\(Commands\.varBookmarkLoaded, true\)/)
assert.match(initBody, /finishLoading: candidateGeneration => this\.viewLoads\.finishLoading\(candidateGeneration\)/)
assert.match(initBody, /finishInitialLoad: error => this\.finishInitialLoad\(error\)/)

assert.match(finalizer, /if \(!port\.isCurrent\(generation\)\) return/)
assert.match(finalizer, /await port\.setLoadFailedContext\(loadFailure !== undefined && !preserveLoadedContext\)/)
assert.match(finalizer, /await port\.setLoadedContext\(\)/)
assert.match(finalizer, /catch \(error\) \{[\s\S]*?port\.reportContextFailure\(error\)/)
assert.match(finalizer, /port\.refreshDecorations\(\)/)
assert.match(finalizer, /port\.finishLoading\(generation\)[\s\S]*?port\.measure\(initializationStartedAt, loadFailure !== undefined\)/)
assert.match(finalizer, /if \(loadFailure\) \{[\s\S]*?port\.finishInitialLoad\(loadFailure\)[\s\S]*?throw loadFailure/)
assert.match(initBody, /closeConfigWatchers: \(\) => this\.configWatcherCoordinator\.closeWatchers\(\)/)
assert.match(provider, /dispose\(\) \{[\s\S]*?this\.configWatcherCoordinator\.dispose\(\)/)
assert.match(watcherLifecycle, /async replace\(/)
assert.match(watcherCoordinator, /closeWatchers\(\): void/)

const refreshStart = provider.indexOf('public async refresh(')
const refreshEnd = provider.indexOf('\n\t// 处理树节点行内操作按钮触发的重命名命令。', refreshStart)
const refreshBody = provider.slice(refreshStart, refreshEnd)
assert.ok(refreshStart >= 0 && refreshEnd > refreshStart)
assert.doesNotMatch(refreshBody, /setContextValue\(Commands\.varBookmarkLoaded, false\)/)
assert.doesNotMatch(refreshBody, /workspaceOrderCache = null/)
assert.match(refreshBody, /return this\.viewRefreshCoordinator\.refresh\(/)
assert.match(refreshCoordinator, /const generation = port\.beginViewLoad\(\)/)
assert.match(refreshCoordinator, /port\.markLoading\(generation\)/)
assert.match(refreshCoordinator, /port\.initView\(scopePath, generation, storageScope\)/)

const providerInitStart = provider.indexOf('init(treeView: vscode.TreeView<Bookmark>): void')
const providerInitEnd = provider.indexOf('\n\tprivate finishInitialLoad(', providerInitStart)
const providerInit = provider.slice(providerInitStart, providerInitEnd)
assert.match(providerInit, /bookmarkTreeViewLifecycle\.startInitialLoad\(treeView, this\.bookmarkTreeViewLifecyclePort\(\)\)/)
assert.match(providerInit, /void this\.initViewEditor\(\)/)
assert.doesNotMatch(providerInit, /await this\.initViewEditor/)
assert.doesNotMatch(providerInit, /Commands\.varBookmarkLoaded, true/)

const finishStart = provider.indexOf('private finishInitialLoad(')
const finishEnd = provider.indexOf('\n\tgetParent(', finishStart)
const finishBody = provider.slice(finishStart, finishEnd)
assert.match(finishBody, /bookmarkTreeViewLifecycle\.finishInitialLoad\(error, this\.bookmarkTreeViewLifecyclePort\(\)\)/)
assert.match(treeViewLifecycle, /if \(this\.initialLoadWatchdog\) this\.scheduling\.clearTimer\(this\.initialLoadWatchdog\)/)
assert.match(treeViewLifecycle, /port\.reportInitialLoadFailure\(error\)/)

const disposeStart = provider.indexOf('\n\tdispose()')
assert.match(provider.slice(disposeStart), /this\.bookmarkTreeViewLifecycle\.dispose\(\)/)
