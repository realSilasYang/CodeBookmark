const assert = require('node:assert/strict')
const fs = require('node:fs')

const extension = fs.readFileSync('src/extension.ts', 'utf8')
const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const launch = JSON.parse(fs.readFileSync('.vscode/launch.json', 'utf8'))
const tasks = JSON.parse(fs.readFileSync('.vscode/tasks.json', 'utf8')).tasks
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const activityIcon = fs.readFileSync('resources/bookmark.svg', 'utf8')

assert.match(extension, /Commands\.varCurrentFolderHasBookmarkedScript, false/)
assert.match(extension, /Commands\.varCurrentFolderHasUnbookmarkedScript, false/)
assert.match(extension, /Commands\.varActiveFileAvailable, hasActiveTextFile\(\)/)
assert.match(extension, /hasActiveTextFile\(\) \|\| hasWorkspaceFolder\(\)/)

assert.match(extension, /export function activate\(context: vscode\.ExtensionContext\): void/)
assert.doesNotMatch(extension, /export async function activate/)

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
