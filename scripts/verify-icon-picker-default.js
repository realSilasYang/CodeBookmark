/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-icon-picker-default`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-icon-picker-default` 对应契约。
 * 核心边界：通过断言锁定“verify-icon-picker-default”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')

const vscodeMock = {
  Uri: {
    file: fsPath => ({ scheme: 'file', fsPath }),
    joinPath: (base, ...segments) => ({ path: [base.path, ...segments].filter(Boolean).join('/') }),
  },
  window: { createOutputChannel: () => ({ appendLine() {}, dispose() {} }) },
}

const restoreModules = installModuleMocks({ vscode: vscodeMock })

const {
  IconPickerWebview,
  shouldShowRestoreDefaultIcon,
} = require('../out/util/quick_pick_icon/IconPickerWebview')
const localization = require('../out/i18n/Localization')

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
  localization.initializeLocalization('zh-cn')
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

  const sampleIcon = { id: 'status_sample.svg', name: 'sample', keywords: ['sample', '示例'] }
  IconPickerWebview._cachedIconDict = [sampleIcon]
  IconPickerWebview._cachedIconMap = new Map([[sampleIcon.id, sampleIcon]])
  const localizedPicker = Object.create(IconPickerWebview.prototype)
  localizedPicker._context = {
    extensionPath: process.cwd(),
    extensionUri: { path: 'extension' },
    globalState: { get: () => [] },
  }
  localizedPicker._panel = {
    webview: {
      cspSource: 'webview-resource:',
      asWebviewUri: uri => ({ toString: () => `webview-resource:/${uri.path}` }),
    },
  }
  localizedPicker._currentIcon = ''
  localizedPicker._defaultIcon = undefined

  localization.initializeLocalization('en-US')
  const englishHtml = await localizedPicker._getHtmlForWebview()
  assert.match(englishHtml, /<html lang="en">/)
  assert.match(englishHtml, /Choose a Bookmark Icon/)
  assert.match(englishHtml, /Code Status/)
  assert.match(englishHtml, /No matching icons found/)
  assert.doesNotMatch(englishHtml, />选择书签图标</)

  localization.initializeLocalization('zh-cn')
  const chineseHtml = await localizedPicker._getHtmlForWebview()
  assert.match(chineseHtml, /<html lang="zh-cn">/)
  assert.match(chineseHtml, /选择书签图标/)
  assert.match(chineseHtml, /代码状态/)
  assert.match(chineseHtml, /未找到匹配的图标/)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  restoreModules()
})
