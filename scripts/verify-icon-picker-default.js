const assert = require('node:assert/strict')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')

const vscodeMock = {
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  window: { createOutputChannel: () => ({ appendLine() {}, dispose() {} }) },
}

const restoreModules = installModuleMocks({ vscode: vscodeMock })

const {
  IconPickerWebview,
  shouldShowRestoreDefaultIcon,
} = require('../out/util/quick_pick_icon/IconPickerWebview')

const defaultTodoIcon = 'status_idea_yellow.svg'
assert.equal(shouldShowRestoreDefaultIcon(defaultTodoIcon, defaultTodoIcon), false)
assert.equal(shouldShowRestoreDefaultIcon('status_idea_red.svg', defaultTodoIcon), true)
assert.equal(shouldShowRestoreDefaultIcon('', ''), false)
assert.equal(shouldShowRestoreDefaultIcon('status_idea_red.svg', ''), true)
assert.equal(shouldShowRestoreDefaultIcon('status_idea_red.svg', undefined), false)

async function main() {
  let selected
  let disposed = false
  const picker = Object.create(IconPickerWebview.prototype)
  picker._bookmarkId = 'todo-bookmark'
  picker._defaultIcon = defaultTodoIcon
  picker._onDidSelectIcon = (iconName, bookmarkId) => { selected = { iconName, bookmarkId } }
  picker.dispose = () => { disposed = true }

  await picker._handleMessage({ command: 'restoreDefaultIcon', iconName: defaultTodoIcon })
  assert.deepEqual(selected, { iconName: defaultTodoIcon, bookmarkId: 'todo-bookmark' })
  assert.equal(disposed, true)

  selected = undefined
  disposed = false
  await picker._handleMessage({ command: 'restoreDefaultIcon', iconName: 'status_idea_red.svg' })
  assert.equal(selected, undefined)
  assert.equal(disposed, false)

  let resolveFirst
  let resolveSecond
  const firstRender = new Promise(resolve => { resolveFirst = resolve })
  const secondRender = new Promise(resolve => { resolveSecond = resolve })
  const rendered = Object.create(IconPickerWebview.prototype)
  rendered._disposed = false
  rendered._renderGeneration = 0
  rendered._panel = { webview: { html: '' } }
  rendered._getHtmlForWebview = () => firstRender
  IconPickerWebview._cachedIconDict = null
  rendered._update()
  assert.match(rendered._panel.webview.html, /正在加载图标/)

  rendered._getHtmlForWebview = () => secondRender
  rendered._update()
  resolveSecond('<html>new render</html>')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(rendered._panel.webview.html, '<html>new render</html>')
  resolveFirst('<html>stale render</html>')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(rendered._panel.webview.html, '<html>new render</html>')

  const source = fs.readFileSync('src/util/quick_pick_icon/IconPickerWebview.ts', 'utf8')
  assert.match(source, /const categoryPageSize = 160/)
  assert.match(source, /fuse\.search\(query, \{ limit: 200 \}\)/)
  assert.match(source, /id="search" disabled/)
  assert.match(source, /function recentIconIds\(/)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  restoreModules()
})
