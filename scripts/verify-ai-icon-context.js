/**
 * 通过真实 AI 服务解析流程验证生成与图标单独优化，共用源码依据。
 * 覆盖手工图标保护和各语言提示词，确保不同入口遵守一致的选图规则。
 */
const assert = require('node:assert/strict')
const { createVscodeFake } = require('./test-support/vscode-fake')
const { installModuleMocks } = require('./test-support/module-mocks')
const { vscode } = createVscodeFake()
const restoreModules = installModuleMocks({ vscode })
const { AIService } = require('../out/util/AIService')
const { normalizeAIBookmarkPayload, normalizeAIOptimizedBookmarks } = require('../out/util/AIBookmarkSchema')
const { initializeLocalization } = require('../out/i18n/Localization')
restoreModules()

async function main() {
  const lines = ['// 下载文件', 'async function transfer() {', '  return downloadFile(remoteUrl)', '}', '',
    '// 验证令牌', 'function authenticate() {', '  return validateToken(token)', '}']
  const source = lines.join('\n')
  const originalRequest = AIService.sendRequest
  const messagesSent = []
  try {
    AIService.sendRequest = async messages => {
      messagesSent.push(messages)
      if (messagesSent.length === 1) return JSON.stringify({ bookmarks: [{
        label: '处理', lineNumber: 2, anchor: lines[1], icon: 'download', children: [],
      }] })
      const bookmarks = JSON.parse(messages[1].content.slice(messages[1].content.indexOf('[{')).split('\n')[0])
      assert.equal(bookmarks[0].canAssignIcon, true)
      assert.equal(bookmarks[1].canAssignIcon, false)
      assert.match(bookmarks[0].sourceContext, /downloadFile/)
      assert.doesNotMatch(bookmarks[0].sourceContext, /validateToken/)
      return JSON.stringify([{ id: 'default', icon: 'download' }, { id: 'manual', icon: 'download' }])
    }
    const generated = await AIService.generateBookmarks(source, 'sample.ts')
    assert.equal(generated[0].iconName, 'ui_inbox_tray_twitter.svg')
    const optimized = await AIService.optimizeBookmarks(source, 'sample.ts', [
      { id: 'default', label: '处理', content: lines[1], start: { line: 1 }, isUsingDefaultIcon: true },
      { id: 'manual', label: '处理', content: lines[1], start: { line: 1 }, isUsingDefaultIcon: false },
    ])
    assert.deepEqual(optimized, [{ id: 'default', iconName: 'ui_inbox_tray_twitter.svg' }])
    assert.match(messagesSent[0][0].content, /附近代码和结构性注释/)
    assert.match(messagesSent[1][0].content, /附近代码和结构性注释/)
    assert.equal(normalizeAIBookmarkPayload({ bookmarks: [{
      label: '处理', lineNumber: 1, anchor: 'downloadUnknownFile()', icon: 'download', children: [],
    }] }, ['run()'])[0].iconName, undefined, 'Invented anchors must not supply icon evidence')
    assert.deepEqual(normalizeAIOptimizedBookmarks([
      { id: 'renamed', new_label: '下载资源', icon: 'download' },
    ], new Map([['renamed', { label: 'Redis 初始化', anchor: 'downloadFile(remoteUrl)', canAssignIcon: true }]])), [
      { id: 'renamed', new_label: '下载资源', iconName: 'ui_inbox_tray_twitter.svg' },
    ], 'An obsolete label must not veto the icon for its corrected meaning')

    const keys = ['sync', 'download', 'upload', 'browser', 'bookmark', 'navigation']
    for (const locale of ['zh-cn', 'zh-hk', 'zh-tw', 'en', 'ja', 'vi', 'ko', 'es', 'fr', 'pt', 'ru', 'de', 'it']) {
      initializeLocalization(locale)
      for (const prompt of [AIService.generationPrompt(), AIService.optimizationPrompt()]) {
        for (const key of keys) assert.match(prompt, new RegExp(`- ${key}[:：]`), `${locale}: ${key}`)
      }
    }
  } finally {
    AIService.sendRequest = originalRequest
    initializeLocalization('zh-cn')
  }
  console.log('AI icon source context, icon-only improvements, custom-icon protection and all localized prompts verified.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
