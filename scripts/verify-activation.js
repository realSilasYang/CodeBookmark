/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-activation`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-activation` 对应契约。
 * 核心边界：通过断言锁定“verify-activation”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`activate`、`activate`、`activate`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const extension = fs.readFileSync('src/extension.ts', 'utf8')
const extensionStateKeys = fs.readFileSync('src/util/constants/ExtensionStateKeys.ts', 'utf8')
const iconPicker = fs.readFileSync('src/util/quick_pick_icon/IconPickerWebview.ts', 'utf8')
const recentIconState = fs.readFileSync('src/util/RecentIconState.ts', 'utf8')
const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const launch = JSON.parse(fs.readFileSync('.vscode/launch.json', 'utf8'))
const tasks = JSON.parse(fs.readFileSync('.vscode/tasks.json', 'utf8')).tasks
const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const activityIcon = fs.readFileSync('resources/bookmark.svg', 'utf8')

assert.match(extension, /Commands\.varCurrentFolderHasBookmarkedScript, false/)
assert.match(extension, /Commands\.varCurrentFolderHasUnbookmarkedScript, false/)
assert.match(extension, /Commands\.varActiveFileAvailable, hasActiveTextFile\(\)/)
assert.match(extension, /hasActiveTextFile\(\) \|\| hasWorkspaceFolder\(\)/)
assert.match(extension, /context\.globalState\.setKeysForSync\(SyncedGlobalStateKeys\)/)
assert.match(extension, /initializeBookmarkIconRoot\(context\.extensionUri\)/)
assert.match(extensionStateKeys, /recentIcons: 'codebookmark\.recentIcons'/)
assert.match(extensionStateKeys, /SyncedGlobalStateKeys[\s\S]*ExtensionStateKeys\.recentIcons/)
assert.doesNotMatch(extensionStateKeys, /lastStorageRoot/)
assert.match(iconPicker, /readRecentIconIds\(context\)/)
assert.match(iconPicker, /writeRecentIconIds\(this\._context,/)
assert.doesNotMatch(iconPicker, /['"]codebookmark\.recentIcons['"]/)
assert.match(recentIconState, /globalState\.get<unknown>\(ExtensionStateKeys\.recentIcons\)/)
assert.match(recentIconState, /globalState\.update\(/)
assert.match(recentIconState, /PersistenceFormats\.recentIcons/)

assert.match(extension, /export function activate\(context: vscode\.ExtensionContext\): CodeBookmarkExtensionApi/)
assert.doesNotMatch(extension, /export async function activate/)
assert.match(extension, /process\.env\.CODEBOOKMARK_INTEGRATION_TEST === '1'/)
assert.match(extension, /Object\.freeze\(\{ language, integration: createIntegrationTestApi\(codeBookmarkProvider\) \}\)/)
assert.match(extension, /Object\.freeze\(\{ language \}\)/)

const activateStart = extension.indexOf('export function activate(')
const activateEnd = extension.indexOf('\nexport async function deactivate', activateStart)
const activateBody = extension.slice(activateStart, activateEnd)
const createView = activateBody.indexOf('createCodeBookmarkView(')
const initializeProvider = activateBody.indexOf('codeBookmarkProvider.init(')
assert.ok(createView >= 0 && initializeProvider > createView, 'TreeView must be registered before provider I/O starts')
assert.equal(activateBody.includes('await '), false, 'activate must return without awaiting I/O')
assert.doesNotMatch(activateBody, /codeBookmarkProvider\.init\([^)]*\)\.catch/)

assert.match(provider, /init\(treeView: vscode\.TreeView<Bookmark>\): void/)
assert.match(provider, /void this\.initViewEditor\(\)/)

const getChildrenStart = provider.indexOf('private _getChildrenInternal(')
const getChildrenEnd = provider.indexOf('\n\tgetTreeItem(', getChildrenStart)
assert.ok(getChildrenStart >= 0 && getChildrenEnd > getChildrenStart)
assert.doesNotMatch(provider.slice(getChildrenStart, getChildrenEnd), /await .*init/i)

assert.equal(launch.configurations[0].preLaunchTask, 'build extension')
const buildTask = tasks.find(task => task.label === 'build extension')
const watchTask = tasks.find(task => task.label === 'watch extension')
assert.ok(buildTask)
assert.equal(buildTask.script, 'compile')
assert.equal(buildTask.isBackground, undefined)
assert.deepEqual(buildTask.group, { kind: 'build', isDefault: true })
assert.ok(watchTask)
assert.equal(watchTask.script, 'watch')
assert.notEqual(watchTask.group?.isDefault, true)

const activityContainer = manifest.contributes.viewsContainers.activitybar
  .find(container => container.id === 'codebookmark')
assert.equal(activityContainer.icon, 'resources/bookmark.svg')
assert.equal(fs.existsSync(activityContainer.icon), true)
assert.match(activityIcon, /fill=["']currentColor["']/)
