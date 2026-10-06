/**
 * 验证短标签、不同语言和局部源码提供的选图证据。
 * 检查相邻模块隔离和不可信图标拒绝，避免无关源码或任意路径影响结果。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildAIIconSourceContext, resolveAIIconNameForSemantic } = require('../../out/util/AIIconCatalog')

test('translated short labels can use a meaningful source anchor', () => {
  for (const label of ['处理', '處理', '処理', '처리', 'Traiter', 'Обработать', 'Xử lý']) {
    assert.equal(resolveAIIconNameForSemantic('clipboard', {
      labels: [label], anchor: 'navigator.clipboard.writeText(value)',
    }), 'ui_clipboard_fluent.svg')
  }
})

test('normalizes reviewed aliases and accepts the model choice among equally supported actions', () => {
  const semantic = { labels: ['处理'], anchor: 'downloadFile(remoteUrl)' }
  assert.equal(resolveAIIconNameForSemantic(' DOWNLOAD ', semantic), 'ui_inbox_tray_twitter.svg')
  assert.equal(resolveAIIconNameForSemantic('link', semantic), 'arch_globe_showing_asia_australia_fluent.svg')
  assert.equal(resolveAIIconNameForSemantic('auth', {
    labels: ['处理'], anchor: 'validateApiKey(key)',
  }), 'arch_key_flat_color.svg')
  for (const icon of ['../../outside.svg', 'ui_clipboard_fluent.svg', 'unknown', '', null]) {
    assert.equal(resolveAIIconNameForSemantic(icon, { labels: ['写入剪贴板'] }), undefined)
  }
})

test('a structural comment and its function provide context without borrowing the next module', () => {
  const lines = ['// 下载远端资源', 'async function transfer() {', '  return downloadFile(remoteUrl)', '}', '',
    '// 验证令牌', 'function authenticate() {', '  return validateToken(token)', '}']
  const sourceContext = buildAIIconSourceContext(lines, 1)
  assert.match(sourceContext, /下载远端资源/)
  assert.doesNotMatch(sourceContext, /令牌|authenticate|validateToken/)
  assert.equal(resolveAIIconNameForSemantic('download', { labels: ['处理'], anchor: lines[1], sourceContext }), 'ui_inbox_tray_twitter.svg')
  assert.equal(resolveAIIconNameForSemantic('authentication', { labels: ['处理'], anchor: lines[1], sourceContext }), undefined)
  assert.equal(buildAIIconSourceContext(lines, 999), '')
})

test('an adjacent declaration cannot lend its brand or domain to a generic anchor', () => {
  const lines = ['const value = 1', 'function authenticate() {', '  return validateApiKey(key)', '}']
  const sourceContext = buildAIIconSourceContext(lines, 0)
  assert.equal(sourceContext, lines[0])
  assert.equal(resolveAIIconNameForSemantic('authentication', { labels: ['处理'], anchor: lines[0], sourceContext }), undefined)
  assert.equal(resolveAIIconNameForSemantic('python', { labels: ['普通模块'], anchor: 'run()' }), undefined)
})
