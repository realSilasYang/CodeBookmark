const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const {
  formatLineNumberedSource,
  normalizeAIBookmarkPayload,
  normalizeAIOptimizedBookmarks,
  resolveAIBookmarkLine,
} = require('../out/util/AIBookmarkSchema')
const {
  DEFAULT_AI_GENERATION_PROMPT,
  DEFAULT_AI_OPTIMIZATION_PROMPT,
} = require('../out/util/constants/AIPrompts')
const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const {
  AI_REQUEST_MAX_BYTES,
  AI_RESPONSE_MAX_BYTES,
  AI_RESPONSE_WARNING_BYTES,
  AI_SOURCE_MAX_BYTES,
  AI_SOURCE_WARNING_BYTES,
  aiContentByteLength,
} = require('../out/util/AIRequestPolicy')

assert.equal(formatLineNumberedSource('first\r\n  second\n'), '1 | first\n2 |   second\n3 | ')
assert.equal(AI_SOURCE_WARNING_BYTES, 512 * 1024)
assert.equal(AI_RESPONSE_WARNING_BYTES, 2 * 1024 * 1024)
assert.equal(AI_SOURCE_MAX_BYTES, 8 * 1024 * 1024)
assert.equal(AI_REQUEST_MAX_BYTES, 16 * 1024 * 1024)
assert.equal(AI_RESPONSE_MAX_BYTES, 16 * 1024 * 1024)
assert.equal(aiContentByteLength('书签'), Buffer.byteLength('书签'))

const current = normalizeAIBookmarkPayload({
  bookmarks: [{
    id: 'model-must-not-own-this',
    path: 'wrong.ts',
    label: '  初始化  ',
    lineNumber: '2',
    anchor: '2 |   const initialize = true',
    params: '99,99,99,99',
    children: [{
      label: '执行',
      lineNumber: 4,
      anchor: 'run()',
      children: [],
    }],
  }],
})
assert.deepEqual(current, [{
  label: '初始化',
  line: 1,
  content: '2 |   const initialize = true',
  subs: [{ label: '执行', line: 3, content: 'run()', subs: [] }],
}])
assert.equal(resolveAIBookmarkLine(['header', '  const initialize = true'], current[0]), 1)

const literalNumberPrefix = normalizeAIBookmarkPayload({
  bookmarks: [{ label: '管道文本', lineNumber: 2, anchor: '2 | literal source', children: [] }],
})[0]
assert.equal(resolveAIBookmarkLine(['header', '2 | literal source'], literalNumberPrefix), 1)
assert.throws(() => normalizeAIBookmarkPayload([]), /bookmarks 数组/)

const promotedChild = normalizeAIBookmarkPayload({
  bookmarks: [{
    label: '',
    children: [{ label: '有效子项', lineNumber: 1, anchor: 'start()', children: [] }],
  }],
})
assert.deepEqual(promotedChild, [{ label: '有效子项', line: 0, content: 'start()', subs: [] }])

const repeatedLines = ['if (first) {', '  return value', '}', 'if (second) {', '  return value', '}']
assert.equal(resolveAIBookmarkLine(repeatedLines, {
  label: '返回第二项',
  line: 4,
  content: 'return value',
  subs: [],
}), 4)
assert.equal(resolveAIBookmarkLine(repeatedLines, {
  label: '纠正行号',
  line: 0,
  content: 'if (second) {',
  subs: [],
}), 3)
assert.equal(resolveAIBookmarkLine(repeatedLines, {
  label: '无效位置',
  line: 999,
  content: 'not present in source',
  subs: [],
}), undefined)
assert.equal(resolveAIBookmarkLine(repeatedLines, {
  label: '仅锚点定位',
  content: 'if (second) {',
  subs: [],
}), 3)
assert.equal(resolveAIBookmarkLine(repeatedLines, {
  label: '锚点不匹配',
  line: 1,
  content: 'this line does not exist',
  subs: [],
}), undefined)
assert.deepEqual(normalizeAIBookmarkPayload({
  bookmarks: [{ label: '严格行号', lineNumber: '2abc', anchor: 'return value', children: [] }],
}), [{ label: '严格行号', line: undefined, content: 'return value', subs: [] }])

assert.deepEqual(normalizeAIBookmarkPayload({
  bookmarks: [{ label: '可读性提升与 URL 还原', lineNumber: 1, anchor: 'restoreReadableUrl()', icon: 'authentication', children: [] }],
}), [{ label: '可读性提升与 URL 还原', line: 0, content: 'restoreReadableUrl()', subs: [] }])
assert.equal(normalizeAIBookmarkPayload({
  bookmarks: [{ label: '可读性提升与 URL 还原', lineNumber: 1, anchor: 'restoreReadableUrl()', icon: 'link', children: [] }],
})[0].iconName, 'arch_globe_showing_asia_australia_fluent.svg')

assert.deepEqual(normalizeAIOptimizedBookmarks([
  { id: 'known-a', new_label: ' 新标签 ' },
  { id: 'unknown', new_label: '越权更新' },
  { id: 'known-a', new_label: '重复更新' },
  { id: 'known-c', new_label: '' },
], new Map([
  ['known-a', { label: '旧标签', anchor: 'run()', canAssignIcon: true }],
  ['known-b', { label: '另一标签', anchor: 'other()', canAssignIcon: true }],
  ['known-c', { label: '空标签', anchor: 'empty()', canAssignIcon: true }],
])), [
  { id: 'known-a', new_label: '新标签' },
])
const manyAllowedIds = Array.from({ length: 350 }, (_, index) => `bookmark-${index}`)
assert.equal(normalizeAIOptimizedBookmarks(
  manyAllowedIds.map(id => ({ id, new_label: `label-${id}` })),
  new Map(manyAllowedIds.map(id => [id, { label: id, anchor: '', canAssignIcon: true }])),
).length, 350)
assert.deepEqual(normalizeAIOptimizedBookmarks([
  { id: 'url', icon: 'authentication' },
  { id: 'auth', icon: 'authentication' },
  { id: 'manual-icon', new_label: '验证令牌', icon: 'authentication' },
], new Map([
  ['url', { label: 'URL 还原', anchor: 'restoreReadableUrl()', canAssignIcon: true }],
  ['auth', { label: 'API Key 验证', anchor: 'validateApiKey()', canAssignIcon: true }],
  ['manual-icon', { label: '验证令牌', anchor: 'validateToken()', canAssignIcon: false }],
])), [
  { id: 'auth', iconName: 'arch_key_flat_color.svg' },
  { id: 'manual-icon', new_label: '验证令牌' },
])

assert.match(DEFAULT_AI_GENERATION_PROMPT, /lineNumber/)
assert.match(DEFAULT_AI_GENERATION_PROMPT, /icon/)
assert.match(DEFAULT_AI_GENERATION_PROMPT, /插件会像手动添加书签一样生成/)
assert.doesNotMatch(DEFAULT_AI_GENERATION_PROMPT, /"id"/)
assert.match(DEFAULT_AI_OPTIMIZATION_PROMPT, /new_label/)

const settings = manifest.contributes.configuration[0].properties
assert.equal(settings['codebookmark.AI.APIKey'].type, 'string')
assert.equal(settings['codebookmark.AI.APIKey'].description, 'AI 接口密钥')
assert.equal(
  settings['codebookmark.AI.model'].markdownDescription,
  'AI 模型名称。配置接口地址及所需密钥后可 [验证 AI 连接](command:codebookmark.ai.testConnection)',
)
assert.equal(
  settings['codebookmark.AI.address'].description,
  '支持资源地址、API Base URL 和完整请求 URL，插件会自动识别并补全。远程服务请使用 HTTPS。',
)
assert.equal(settings['codebookmark.AI.prompt'].default, DEFAULT_AI_GENERATION_PROMPT)
assert.equal(settings['codebookmark.AI.optimizePrompt'].default, DEFAULT_AI_OPTIMIZATION_PROMPT)
assert.equal(settings['codebookmark.AI.assignIcons'].description, '让 AI 在生成书签后选择书签图标')
assert.equal(settings['codebookmark.AI.prompt'].description, 'AI 自动提取书签的系统提示词。')
assert.equal(settings['codebookmark.AI.optimizePrompt'].description, 'AI 优化书签标签和语义图标时的提示词。')
assert.equal(settings['codebookmark.AI.timeoutS'].default, 60)
assert.equal(settings['codebookmark.AI.timeoutS'].minimum, 1)
assert.equal(settings['codebookmark.AI.timeoutS'].maximum, 600)
assert.deepEqual(Object.keys(settings), [
  'codebookmark.globalStoragePath',
  'codebookmark.defaultExpandLevel',
  'codebookmark.autoSpace',
  'codebookmark.inlineLabel',
  'codebookmark.AI.address',
  'codebookmark.AI.APIKey',
  'codebookmark.AI.model',
  'codebookmark.AI.assignIcons',
  'codebookmark.AI.timeoutS',
  'codebookmark.AI.prompt',
  'codebookmark.AI.optimizePrompt',
])
assert.deepEqual(Object.values(settings).map(setting => setting.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

const commandsById = new Map(manifest.contributes.commands.map(command => [command.command, command]))
assert.equal(commandsById.get('codebookmark.ai.generateSkip').title, '$(diff-added) 生成')
assert.equal(commandsById.get('codebookmark.ai.generateAppend').title, '$(add) 追加')
assert.equal(commandsById.get('codebookmark.ai.generateOverwrite').title, '$(replace) 重新生成并替换')
assert.equal(commandsById.get('codebookmark.ai.generateAppendFolder').title, '$(add) 为有书签的脚本追加')
assert.equal(commandsById.get('codebookmark.ai.generateOverwriteFolder').title, '$(replace) 为有书签的脚本重新生成并替换')
assert.equal(commandsById.get('codebookmark.ai.generateAppendFolderDirect').title, '$(add) 为当前文件夹内有书签的脚本追加')
assert.equal(commandsById.get('codebookmark.ai.generateOverwriteFolderDirect').title, '$(replace) 为当前文件夹内有书签的脚本重新生成并替换')
assert.equal(commandsById.get('codebookmark.ai.generateSkipFolder').title, '$(diff-added) 为所有无书签脚本生成')
assert.equal(commandsById.get('codebookmark.ai.generateSkipFolderDirect').title, '$(diff-added) 为当前文件夹内无书签脚本生成')
assert.equal(commandsById.get('codebookmark.ai.optimize').title, '$(hubot) 当前脚本')
assert.equal(commandsById.get('codebookmark.ai.optimizeDirect').title, '$(hubot) 优化当前脚本的书签标签')
assert.equal(commandsById.get('codebookmark.ai.optimizeFolderDirect').title, '$(hubot) 优化当前文件夹内有书签的脚本中的书签标签')
assert.equal(commandsById.get('codebookmark.ai.optimizeSelectedDirect').title, '$(hubot) 优化选中书签的标签')
assert.equal(commandsById.get('codebookmark.ai.optimizeFolder').title, '$(hubot) 当前文件夹内有书签的脚本')
assert.equal(commandsById.get('codebookmark.openSettings').title, '$(settings) 代码书签设置')
assert.equal(commandsById.get('codebookmark.ai.openSettings').title, '$(settings) AI 配置')
assert.equal(commandsById.has('codebookmark.ai.unavailable'), false)
assert.equal(commandsById.has('codebookmark.ai.setApiKey'), false)
assert.equal(commandsById.has('codebookmark.ai.clearApiKey'), false)
const submenusById = new Map(manifest.contributes.submenus.map(submenu => [submenu.id, submenu]))
assert.equal(submenusById.get('codebookmark.aiGenerateFileSubmenu').label, '当前脚本')
assert.equal(submenusById.get('codebookmark.aiGenerateFolderSubmenu').label, '当前文件夹')
assert.equal(submenusById.get('codebookmark.aiGenerateWorkspaceSubmenu').label, '生成书签')
assert.equal(submenusById.get('codebookmark.aiOptimizeSubmenu').label, '优化书签标签')
const folderGenerateMenu = manifest.contributes.menus['codebookmark.aiGenerateFolderSubmenu']
  .find(item => item.command === 'codebookmark.ai.generateSkipFolder')
assert.match(folderGenerateMenu.when, /codebookmark\.currentFolderHasUnbookmarkedScript/)
const folderGenerateSubmenu = manifest.contributes.menus['codebookmark.aiGenerateSubmenu']
  .find(item => item.submenu === 'codebookmark.aiGenerateFolderSubmenu')
const fileGenerateSubmenu = manifest.contributes.menus['codebookmark.aiGenerateSubmenu']
  .find(item => item.submenu === 'codebookmark.aiGenerateFileSubmenu')
assert.equal(
  folderGenerateSubmenu.when,
  'workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript',
)
assert.equal(
  fileGenerateSubmenu.when,
  '(workspaceFolderCount > 0 && (codebookmark.currentFolderHasUnbookmarkedScript || codebookmark.currentFolderHasBookmarkedScript)) && (codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark)',
)
const directFileGenerationCommands = new Set([
  'codebookmark.ai.generateSkip',
  'codebookmark.ai.generateAppend',
  'codebookmark.ai.generateOverwrite',
])
const directFileGenerateItems = manifest.contributes.menus['codebookmark.aiGenerateSubmenu']
  .filter(item => directFileGenerationCommands.has(item.command))
assert.equal(directFileGenerateItems.length, 3)
assert.equal(
  directFileGenerateItems.find(item => item.command === 'codebookmark.ai.generateSkip').when,
  '(workspaceFolderCount > 0 && (codebookmark.currentFolderHasUnbookmarkedScript || codebookmark.currentFolderHasBookmarkedScript)) && codebookmark.activeFileAvailable && !codebookmark.activeFileHasBookmark',
)
assert.equal(
  directFileGenerateItems
    .filter(item => item.command !== 'codebookmark.ai.generateSkip')
    .every(item => item.when === '(codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark) && !(workspaceFolderCount > 0 && (codebookmark.currentFolderHasUnbookmarkedScript || codebookmark.currentFolderHasBookmarkedScript))'),
  true,
)
assert.equal(
  manifest.contributes.menus['codebookmark.aiGenerateSubmenu']
    .find(item => item.command === 'codebookmark.ai.generateSkipFolderDirect').when,
  'workspaceFolderCount > 0 && codebookmark.currentFolderHasUnbookmarkedScript && !codebookmark.currentFolderHasBookmarkedScript',
)
assert.deepEqual(
  manifest.contributes.menus['codebookmark.aiGenerateFileSubmenu'],
  [
    {
      command: 'codebookmark.ai.generateAppend',
      group: '1_items@1',
      when: '(codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark)',
    },
    {
      command: 'codebookmark.ai.generateOverwrite',
      group: '1_items@2',
      when: '(codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark)',
    },
  ],
)
assert.equal(
  manifest.contributes.menus['codebookmark.aiGenerateFolderSubmenu']
    .every(item => item.when.includes('workspaceFolderCount > 0')),
  true,
)
assert.deepEqual(manifest.contributes.menus['codebookmark.aiGenerateWorkspaceSubmenu'], [
  {
    command: 'codebookmark.ai.generateSkipFolderDirect',
    group: '1_items@1',
    when: 'workspaceFolderCount > 0 && codebookmark.currentFolderHasUnbookmarkedScript',
  },
  {
    command: 'codebookmark.ai.generateAppendFolderDirect',
    group: '1_items@2',
    when: 'workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript',
  },
  {
    command: 'codebookmark.ai.generateOverwriteFolderDirect',
    group: '1_items@3',
    when: 'workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript',
  },
])
assert.equal(
  manifest.contributes.menus['codebookmark.aiGenerateFolderSubmenu']
    .filter(item => item.command !== 'codebookmark.ai.generateSkipFolder')
    .every(item => item.when.includes('codebookmark.currentFolderHasBookmarkedScript')),
  true,
)
const menusContainingCommand = command => Object.entries(manifest.contributes.menus)
  .filter(([, items]) => items.some(item => item.command === command))
  .map(([menuId]) => menuId)
assert.deepEqual(menusContainingCommand('codebookmark.ai.generateSkipFolder'), ['codebookmark.aiGenerateFolderSubmenu'])
assert.deepEqual(menusContainingCommand('codebookmark.ai.generateAppendFolder'), ['codebookmark.aiGenerateFolderSubmenu'])
assert.deepEqual(menusContainingCommand('codebookmark.ai.generateOverwriteFolder'), ['codebookmark.aiGenerateFolderSubmenu'])
assert.deepEqual(
  menusContainingCommand('codebookmark.ai.generateAppendFolderDirect').sort(),
  ['codebookmark.aiGenerateWorkspaceSubmenu', 'commandPalette'].sort(),
)
assert.deepEqual(
  menusContainingCommand('codebookmark.ai.generateOverwriteFolderDirect').sort(),
  ['codebookmark.aiGenerateWorkspaceSubmenu', 'commandPalette'].sort(),
)
const folderOptimizeMenu = manifest.contributes.menus['codebookmark.aiOptimizeSubmenu']
  .find(item => item.command === 'codebookmark.ai.optimizeFolder')
assert.equal(folderOptimizeMenu.when, '(workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript)')
const currentFileOptimizeMenu = manifest.contributes.menus['codebookmark.aiOptimizeSubmenu']
  .find(item => item.command === 'codebookmark.ai.optimize')
assert.equal(currentFileOptimizeMenu.when, '(codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark)')
const optimizeTargetSubmenu = manifest.contributes.menus['codebookmark.aiSubmenu']
  .find(item => item.submenu === 'codebookmark.aiOptimizeSubmenu')
const trustedAIAvailable = '(codebookmark.aiAnalysisAvailable && isWorkspaceTrusted)'
assert.equal(
  optimizeTargetSubmenu.when,
  `${trustedAIAvailable} && (((codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark) && (workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript)) || ((codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark) && codebookmark.hasSelection) || ((workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript) && codebookmark.hasSelection))`,
)
const directOptimizeMenu = manifest.contributes.menus['codebookmark.aiSubmenu']
  .find(item => item.command === 'codebookmark.ai.optimizeDirect')
assert.equal(
  directOptimizeMenu.when,
  `${trustedAIAvailable} && (codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark) && !codebookmark.hasSelection && !(workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript)`,
)
const directFolderOptimizeMenu = manifest.contributes.menus['codebookmark.aiSubmenu']
  .find(item => item.command === 'codebookmark.ai.optimizeFolderDirect')
assert.equal(
  directFolderOptimizeMenu.when,
  `${trustedAIAvailable} && (workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript) && !(codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark) && !codebookmark.hasSelection`,
)
const directSelectedOptimizeMenu = manifest.contributes.menus['codebookmark.aiSubmenu']
  .find(item => item.command === 'codebookmark.ai.optimizeSelectedDirect')
assert.equal(
  directSelectedOptimizeMenu.when,
  `${trustedAIAvailable} && workspaceFolderCount > 0 && codebookmark.hasSelection && !(codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark) && !(workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript)`,
)
const generateTargetSubmenu = manifest.contributes.menus['codebookmark.aiSubmenu']
  .find(item => item.submenu === 'codebookmark.aiGenerateSubmenu')
assert.equal(
  generateTargetSubmenu.when,
  `${trustedAIAvailable} && codebookmark.activeFileAvailable && (codebookmark.activeFileHasBookmark || (workspaceFolderCount > 0 && (codebookmark.currentFolderHasUnbookmarkedScript || codebookmark.currentFolderHasBookmarkedScript)))`,
)
const generateWorkspaceTargetSubmenu = manifest.contributes.menus['codebookmark.aiSubmenu']
  .find(item => item.submenu === 'codebookmark.aiGenerateWorkspaceSubmenu')
assert.equal(
  generateWorkspaceTargetSubmenu.when,
  `${trustedAIAvailable} && !codebookmark.activeFileAvailable && (workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript)`,
)
const directGenerateMenu = manifest.contributes.menus['codebookmark.aiSubmenu']
  .find(item => item.command === 'codebookmark.ai.generateSkip')
assert.equal(
  directGenerateMenu.when,
  `${trustedAIAvailable} && codebookmark.activeFileAvailable && !codebookmark.activeFileHasBookmark && !(workspaceFolderCount > 0 && (codebookmark.currentFolderHasUnbookmarkedScript || codebookmark.currentFolderHasBookmarkedScript))`,
)
const directFolderGenerateMenu = manifest.contributes.menus['codebookmark.aiSubmenu']
  .find(item => item.command === 'codebookmark.ai.generateSkipFolderDirect')
assert.equal(
  directFolderGenerateMenu.when,
  `${trustedAIAvailable} && !codebookmark.activeFileAvailable && workspaceFolderCount > 0 && codebookmark.currentFolderHasUnbookmarkedScript && !codebookmark.currentFolderHasBookmarkedScript`,
)
assert.equal(
  manifest.contributes.menus['codebookmark.aiSubmenu']
    .filter(item => item.group.startsWith('1_items'))
    .every(item => item.when.includes('codebookmark.aiAnalysisAvailable')
      && item.when.includes('isWorkspaceTrusted')),
  true,
)

const menuIdentity = item => item.command ?? item.submenu
const visibleMenuItems = (menuId, state) => manifest.contributes.menus[menuId]
  .filter(item => !item.when || vm.runInNewContext(item.when, {
    workspaceFolderCount: state.workspaceFolders,
    isWorkspaceTrusted: state.workspaceTrusted,
    view: 'codebookmarkTreeView',
    codebookmarkTreeView: 'codebookmarkTreeView',
    codebookmark: {
      aiAnalysisAvailable: state.fileOpen || state.workspaceFolders > 0,
      activeFileAvailable: state.fileOpen,
      activeFileHasBookmark: state.hasBookmarks,
      hasSelection: state.hasSelection,
      currentFolderHasBookmarkedScript: state.folderHasBookmarkedScript,
      currentFolderHasUnbookmarkedScript: state.folderHasUnbookmarkedScript,
    },
  }))
  .map(menuIdentity)

const menuState = overrides => ({
  fileOpen: true,
  workspaceFolders: 0,
  workspaceTrusted: true,
  hasBookmarks: false,
  hasSelection: false,
  folderHasBookmarkedScript: false,
  folderHasUnbookmarkedScript: false,
  ...overrides,
})

assert.deepEqual(
  visibleMenuItems('codebookmark.aiSubmenu', menuState({
    workspaceFolders: 1,
    workspaceTrusted: false,
    hasBookmarks: true,
    folderHasBookmarkedScript: true,
    folderHasUnbookmarkedScript: true,
  })),
  ['codebookmark.ai.openSettings'],
)

const menuStateCases = [
  {
    name: 'no file and no workspace',
    state: menuState({ fileOpen: false }),
    ai: [],
  },
  {
    name: 'no file in workspace',
    state: menuState({
      fileOpen: false,
      workspaceFolders: 1,
      folderHasBookmarkedScript: true,
      folderHasUnbookmarkedScript: true,
    }),
    ai: ['codebookmark.aiGenerateWorkspaceSubmenu', 'codebookmark.ai.optimizeFolderDirect'],
  },
  {
    name: 'no file in workspace with only unbookmarked scripts',
    state: menuState({
      fileOpen: false,
      workspaceFolders: 1,
      folderHasUnbookmarkedScript: true,
    }),
    ai: ['codebookmark.ai.generateSkipFolderDirect'],
  },
  {
    name: 'no file in workspace with only bookmarked scripts',
    state: menuState({
      fileOpen: false,
      workspaceFolders: 1,
      folderHasBookmarkedScript: true,
    }),
    ai: ['codebookmark.aiGenerateWorkspaceSubmenu', 'codebookmark.ai.optimizeFolderDirect'],
  },
  {
    name: 'single file without bookmarks',
    state: menuState(),
    ai: ['codebookmark.ai.generateSkip'],
  },
  {
    name: 'single file without bookmarks and stale selection',
    state: menuState({ hasSelection: true }),
    ai: ['codebookmark.ai.generateSkip'],
  },
  {
    name: 'single file with bookmarks',
    state: menuState({ hasBookmarks: true }),
    ai: ['codebookmark.aiGenerateSubmenu', 'codebookmark.ai.optimizeDirect'],
  },
  {
    name: 'single file with bookmarks and selection',
    state: menuState({ hasBookmarks: true, hasSelection: true }),
    ai: ['codebookmark.aiGenerateSubmenu', 'codebookmark.aiOptimizeSubmenu'],
  },
  {
    name: 'workspace file without bookmarks or eligible folder scripts',
    state: menuState({ workspaceFolders: 1 }),
    ai: ['codebookmark.ai.generateSkip'],
  },
  {
    name: 'workspace folder with only unbookmarked scripts',
    state: menuState({ workspaceFolders: 1, folderHasUnbookmarkedScript: true }),
    ai: ['codebookmark.aiGenerateSubmenu'],
  },
  {
    name: 'workspace folder with only unbookmarked scripts and selection',
    state: menuState({
      workspaceFolders: 1,
      hasSelection: true,
      folderHasUnbookmarkedScript: true,
    }),
    ai: ['codebookmark.aiGenerateSubmenu', 'codebookmark.ai.optimizeSelectedDirect'],
  },
  {
    name: 'mixed workspace folder without current-file bookmarks',
    state: menuState({
      workspaceFolders: 1,
      folderHasBookmarkedScript: true,
      folderHasUnbookmarkedScript: true,
    }),
    ai: ['codebookmark.aiGenerateSubmenu', 'codebookmark.ai.optimizeFolderDirect'],
  },
  {
    name: 'mixed workspace folder without current-file bookmarks and selection',
    state: menuState({
      workspaceFolders: 1,
      hasSelection: true,
      folderHasBookmarkedScript: true,
      folderHasUnbookmarkedScript: true,
    }),
    ai: ['codebookmark.aiGenerateSubmenu', 'codebookmark.aiOptimizeSubmenu'],
  },
  {
    name: 'workspace file with bookmarks',
    state: menuState({
      workspaceFolders: 1,
      hasBookmarks: true,
      folderHasBookmarkedScript: true,
    }),
    ai: ['codebookmark.aiGenerateSubmenu', 'codebookmark.aiOptimizeSubmenu'],
  },
  {
    name: 'mixed workspace folder with current-file bookmarks and selection',
    state: menuState({
      workspaceFolders: 1,
      hasBookmarks: true,
      hasSelection: true,
      folderHasBookmarkedScript: true,
      folderHasUnbookmarkedScript: true,
    }),
    ai: ['codebookmark.aiGenerateSubmenu', 'codebookmark.aiOptimizeSubmenu'],
  },
]
for (const testCase of menuStateCases) {
  const visibleAnalysisItems = visibleMenuItems('codebookmark.aiSubmenu', testCase.state)
    .filter(item => item !== 'codebookmark.ai.openSettings')
  assert.deepEqual(visibleAnalysisItems, testCase.ai, testCase.name)
  if (testCase.ai.includes('codebookmark.aiGenerateSubmenu')) {
    assert.ok(visibleMenuItems('codebookmark.aiGenerateSubmenu', testCase.state).length >= 2, testCase.name)
  }
	if (testCase.ai.includes('codebookmark.aiGenerateWorkspaceSubmenu')) {
		assert.ok(visibleMenuItems('codebookmark.aiGenerateWorkspaceSubmenu', testCase.state).length >= 2, testCase.name)
	}
  if (testCase.ai.includes('codebookmark.aiOptimizeSubmenu')) {
    assert.ok(visibleMenuItems('codebookmark.aiOptimizeSubmenu', testCase.state).length >= 2, testCase.name)
  }
}

const assertNoRedundantSubmenus = (menuId, state, stateName) => {
  for (const item of manifest.contributes.menus[menuId]) {
    if (!item.submenu || !visibleMenuItems(menuId, state).includes(item.submenu)) continue
    const children = visibleMenuItems(item.submenu, state)
    assert.ok(children.length >= 2, `${stateName}: ${item.submenu} has ${children.length} visible item(s)`)
    assertNoRedundantSubmenus(item.submenu, state, stateName)
  }
}

for (const fileOpen of [false, true]) {
  for (const workspaceFolders of [0, 1]) {
    for (const hasBookmarks of [false, true]) {
      for (const hasSelection of [false, true]) {
        for (const folderHasBookmarkedScript of [false, true]) {
          for (const folderHasUnbookmarkedScript of [false, true]) {
            const state = menuState({
              fileOpen,
              workspaceFolders,
              hasBookmarks,
              hasSelection,
              folderHasBookmarkedScript,
              folderHasUnbookmarkedScript,
            })
            assertNoRedundantSubmenus(
              'codebookmark.aiSubmenu',
              state,
              JSON.stringify(state),
            )
          }
        }
      }
    }
  }
}

assert.deepEqual(visibleMenuItems('codebookmark.aiGenerateSubmenu', menuState()), [])
assert.deepEqual(
  visibleMenuItems('codebookmark.aiGenerateSubmenu', menuState({ hasBookmarks: true })),
  ['codebookmark.ai.generateAppend', 'codebookmark.ai.generateOverwrite'],
)
assert.deepEqual(visibleMenuItems('codebookmark.aiGenerateSubmenu', menuState({
  workspaceFolders: 1,
  folderHasUnbookmarkedScript: true,
})), ['codebookmark.ai.generateSkip', 'codebookmark.ai.generateSkipFolderDirect'])
assert.deepEqual(visibleMenuItems('codebookmark.aiGenerateSubmenu', menuState({
  workspaceFolders: 1,
  folderHasBookmarkedScript: true,
  folderHasUnbookmarkedScript: true,
})), ['codebookmark.ai.generateSkip', 'codebookmark.aiGenerateFolderSubmenu'])
assert.deepEqual(visibleMenuItems('codebookmark.aiGenerateSubmenu', menuState({
  workspaceFolders: 1,
  hasBookmarks: true,
  folderHasBookmarkedScript: true,
})), ['codebookmark.aiGenerateFileSubmenu', 'codebookmark.aiGenerateFolderSubmenu'])
assert.deepEqual(visibleMenuItems('codebookmark.aiGenerateFolderSubmenu', menuState({
  workspaceFolders: 1,
  folderHasBookmarkedScript: true,
})), ['codebookmark.ai.generateAppendFolder', 'codebookmark.ai.generateOverwriteFolder'])
assert.deepEqual(visibleMenuItems('codebookmark.aiGenerateFolderSubmenu', menuState({
  workspaceFolders: 1,
  folderHasBookmarkedScript: true,
  folderHasUnbookmarkedScript: true,
})), [
  'codebookmark.ai.generateSkipFolder',
  'codebookmark.ai.generateAppendFolder',
  'codebookmark.ai.generateOverwriteFolder',
])

assert.deepEqual(visibleMenuItems('codebookmark.aiOptimizeSubmenu', menuState({
  hasBookmarks: true,
  hasSelection: true,
})), ['codebookmark.ai.optimizeSelected', 'codebookmark.ai.optimize'])
assert.deepEqual(visibleMenuItems('codebookmark.aiOptimizeSubmenu', menuState({
  workspaceFolders: 1,
  hasSelection: true,
  folderHasBookmarkedScript: true,
})), ['codebookmark.ai.optimizeSelected', 'codebookmark.ai.optimizeFolder'])
assert.deepEqual(visibleMenuItems('codebookmark.aiOptimizeSubmenu', menuState({
  workspaceFolders: 1,
  hasBookmarks: true,
  folderHasBookmarkedScript: true,
})), ['codebookmark.ai.optimize', 'codebookmark.ai.optimizeFolder'])
assert.deepEqual(visibleMenuItems('codebookmark.aiOptimizeSubmenu', menuState({
  workspaceFolders: 1,
  hasBookmarks: true,
  hasSelection: true,
  folderHasBookmarkedScript: true,
})), ['codebookmark.ai.optimizeSelected', 'codebookmark.ai.optimize', 'codebookmark.ai.optimizeFolder'])
assert.deepEqual(manifest.contributes.menus['codebookmark.aiSubmenu'].slice(-1), [
  { command: 'codebookmark.ai.openSettings', group: '2_configuration@1' },
])
assert.equal(
  manifest.contributes.menus['codebookmark.aiSubmenu']
    .some(item => item.command === 'codebookmark.ai.testConnection'),
  false,
)

const providerSource = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const contextCoordinatorSource = fs.readFileSync('src/providers/BookmarkContextCoordinator.ts', 'utf8')
const taskRegistrySource = fs.readFileSync('src/providers/AITaskRegistry.ts', 'utf8')
const sourceSnapshotSource = fs.readFileSync('src/util/AISourceSnapshot.ts', 'utf8')
const labelMutationSource = fs.readFileSync('src/util/AIOptimizationMutations.ts', 'utf8')
const bookmarkBuilderSource = fs.readFileSync('src/providers/AIBookmarkBuilder.ts', 'utf8')
const folderScannerSource = fs.readFileSync('src/util/AISourceFolderScanner.ts', 'utf8')
const folderPresenceSource = fs.readFileSync('src/providers/AIFolderPresenceCache.ts', 'utf8')
const workflowGuardSource = fs.readFileSync('src/providers/AIWorkflowGuard.ts', 'utf8')
const singleFileRunnerSource = fs.readFileSync('src/providers/AISingleFileWorkflowRunner.ts', 'utf8')
const folderRunnerSource = fs.readFileSync('src/providers/AIFolderWorkflowRunner.ts', 'utf8')
const workflowControllerSource = fs.readFileSync('src/providers/AIWorkflowController.ts', 'utf8')
const selectedRunnerSource = fs.readFileSync('src/providers/AISelectedBookmarksWorkflowRunner.ts', 'utf8')
const serviceSource = fs.readFileSync('src/util/AIService.ts', 'utf8')
const endpointResolverSource = fs.readFileSync('src/util/AIEndpointResolver.ts', 'utf8')
const protocolCodecSource = fs.readFileSync('src/util/AIProtocolCodec.ts', 'utf8')
const httpTransportSource = fs.readFileSync('src/util/AIHttpTransport.ts', 'utf8')
const bookmarkCommandsSource = fs.readFileSync('src/commands/bookmarkCommands.ts', 'utf8')
const aiWorkflowSource = providerSource + workflowControllerSource + singleFileRunnerSource + folderRunnerSource + selectedRunnerSource
const aiRunnerSource = singleFileRunnerSource + folderRunnerSource + selectedRunnerSource
assert.match(providerSource, /import \{ AITaskRegistry \} from '\.\/AITaskRegistry'/)
assert.match(providerSource, /private readonly aiTaskRegistry = new AITaskRegistry\(\)/)
assert.match(aiRunnerSource, /taskRegistry\.fileTaskKey\(taskScope, pathRel\)/)
assert.match(aiRunnerSource, /taskRegistry\.tryStartFile\(taskKey\)/)
assert.match(folderRunnerSource, /taskRegistry\.tryStartFolder\(taskScope\)/)
assert.doesNotMatch(providerSource, /runningAITasks|runningAIFolderScopes/)
assert.match(taskRegistrySource, /fileTaskKey\(scope: string, relativePath: string\)/)
assert.match(taskRegistrySource, /tryStartFile\(taskKey: string\)/)
assert.match(taskRegistrySource, /finishFile\(taskKey: string\)/)
assert.match(taskRegistrySource, /tryStartFolder\(scope: string\)/)
assert.match(taskRegistrySource, /finishFolder\(scope: string\)/)
assert.ok((folderRunnerSource.match(/consecutiveRequestFailures >= 3/g) || []).length >= 2)
assert.ok((aiWorkflowSource.match(/[Ww]orkflowGuard\.assertBookmarkInput\(/g) || []).length >= 5)
assert.ok((aiWorkflowSource.match(/[Ww]orkflowGuard\.assertStorageScope\(taskScope\)/g) || []).length >= 5)
assert.ok((aiWorkflowSource.match(/[Ww]orkflowGuard\.captureBookmarkInput\(/g) || []).length >= 5)
assert.doesNotMatch(providerSource, /private assertAIBookmarkInputSnapshot|private assertStorageScope/)
assert.match(providerSource, /return runGenerateBookmarksForFile\(editor, mode, this\.aiSingleFileWorkflowPort\(\)\)/)
assert.match(providerSource, /return runOptimizeBookmarksForFile\(editor, this\.aiSingleFileWorkflowPort\(\)\)/)
assert.doesNotMatch(providerSource, /AI 智能代码书签提取运行中|AI 书签优化运行中/)
assert.match(singleFileRunnerSource, /AI 智能代码书签提取运行中/)
assert.match(singleFileRunnerSource, /AI 书签优化运行中/)
assert.match(singleFileRunnerSource, /saveUndoState\('generateAIBookmarks'\)/)
assert.match(singleFileRunnerSource, /saveUndoState\('optimizeAIBookmarks'\)/)
assert.match(providerSource, /return this\.aiWorkflowController\.generateFolder\(mode\)/)
assert.match(providerSource, /return this\.aiWorkflowController\.optimizeFolder\(\)/)
assert.match(workflowControllerSource, /await runGenerateBookmarksForFolder\([\s\S]*?await this\.folderWorkflowTarget\(\)/)
assert.match(workflowControllerSource, /await runOptimizeBookmarksForFolder\([\s\S]*?await this\.folderWorkflowTarget\(\)/)
assert.match(workflowControllerSource, /const editor = vscode\.window\.activeTextEditor[\s\S]*?await this\.port\.ensureEditorScope\(editor\)[\s\S]*?this\.port\.workspaceFolderRootForCurrentScope\(\)/)
assert.match(workflowControllerSource, /await this\.port\.refreshScope\(storageScope\)/)
assert.match(workflowControllerSource, /folderWorkflowPort\(\): AIFolderWorkflowPort/)
assert.equal((workflowControllerSource.match(/this\.port\.folderWorkflowPort\(\)/g) || []).length, 2)
assert.doesNotMatch(providerSource, /AI 批量智能提取书签运行中|AI 正在扫描文件夹中的书签/)
assert.match(folderRunnerSource, /AI 批量智能提取书签运行中/)
assert.match(folderRunnerSource, /AI 正在扫描文件夹中的书签/)
assert.match(folderRunnerSource, /saveUndoState\('generateAIBookmarks'\)/)
assert.match(folderRunnerSource, /saveUndoState\('optimizeAIBookmarks'\)/)
assert.match(providerSource, /return runOptimizeSelectedBookmarks\(/)
assert.doesNotMatch(providerSource, /AI 正在优化 .*个书签/)
assert.match(selectedRunnerSource, /AI 正在优化 .*个书签/)
assert.match(selectedRunnerSource, /saveUndoState\('optimizeAIBookmarks'\)/)
assert.doesNotMatch(providerSource, /AIService|readAISourceSnapshot|assertAISourceSnapshot|resolveAIOptimizationChanges|applyAIOptimizationChanges/)
assert.ok((aiRunnerSource.match(/saveBookmarks\(\[filePath\]\)/g) || []).length >= 3)
assert.match(providerSource, /folderBookmarkPresence/)
assert.match(providerSource, /this\.aiWorkflowController\.folderBookmarkPresence\(directory\)/)
assert.match(workflowControllerSource, /this\.folderPresenceCache\.getPresence\(/)
assert.match(workflowControllerSource, /presence\.hasBookmarkedScript && presence\.hasUnbookmarkedScript/)
assert.match(providerSource, /this\.aiWorkflowController\.invalidateSourceFiles\(\)/)
assert.match(workflowControllerSource, /bookmarkPathPresenceSignature\(this\.port\.bookmarkRoots\(\)\)/)
assert.doesNotMatch(providerSource, /aiFolderSourceGeneration|aiFolderPresenceCache/)
assert.match(folderRunnerSource, /listAISourceFilesInFolder\(dirPath\)/)
assert.match(workflowControllerSource, /visitAISourceFilesInFolder\(directory/)
assert.match(contextCoordinatorSource, /Commands\.varCurrentFolderHasUnbookmarkedScript/)
assert.match(contextCoordinatorSource, /Commands\.varCurrentFolderHasBookmarkedScript/)
assert.match(folderPresenceSource, /async getPresence\(/)
assert.match(selectedRunnerSource, /vscode\.workspace\.textDocuments\.find/)
assert.match(aiRunnerSource, /readAISourceSnapshot\(/)
assert.match(aiRunnerSource, /assertAISourceSnapshot\(/)
assert.match(folderRunnerSource, /buildAIBookmarks\(/)
assert.match(aiRunnerSource, /resolveAIOptimizationChanges\(/)
assert.match(aiRunnerSource, /applyAIOptimizationChanges\(/)
assert.match(sourceSnapshotSource, /kind: 'document'/)
assert.match(sourceSnapshotSource, /assertAIDocumentSnapshot\(/)
assert.match(sourceSnapshotSource, /before\.mtimeMs !== after\.mtimeMs/)
assert.match(labelMutationSource, /codeMarker\.generatedLabel = change\.label/)
assert.match(bookmarkBuilderSource, /existingBookmarks\.filter\(bookmark => bookmark\.isCodeMarker\)/)
assert.match(bookmarkBuilderSource, /occupiedLines: new Set\(occupiedBookmarks\.map/)
assert.match(bookmarkBuilderSource, /TreeItemCollapsibleState\.Expanded/)
assert.match(folderScannerSource, /maxFiles: 500/)
assert.match(folderScannerSource, /maxEntries: 20_000/)
assert.match(folderScannerSource, /maxDepth: 64/)
assert.match(folderScannerSource, /SOURCE_SCAN_EXCLUDED_DIRECTORIES/)
assert.match(folderPresenceSource, /sourceGeneration === sourceGeneration/)
assert.match(folderPresenceSource, /expiresAt > this\.now\(\)/)
assert.match(workflowGuardSource, /书签已被修改，已停止应用过期结果/)
assert.match(workflowGuardSource, /书签作用域已切换，已停止应用 AI 结果/)
assert.match(serviceSource, /confirmSourceSize/)
assert.match(serviceSource, /resolveAIRequestTargets/)
assert.match(serviceSource, /return \{ content, address: target\.url\.toString\(\) \}/)
assert.match(serviceSource, /encodeAIProtocolRequest/)
assert.match(serviceSource, /decodeAIProtocolResponse/)
assert.match(serviceSource, /postAIJson/)
assert.match(serviceSource, /function isUnavailableRouteError/)
assert.match(serviceSource, /deployment\|model\|resource/)
assert.match(httpTransportSource, /serviceErrorCode/)
assert.match(endpointResolverSource, /target\.url\.origin !== origin/)
assert.match(protocolCodecSource, /store: false/)
assert.match(httpTransportSource, /response\.pause\(\)/)
assert.match(httpTransportSource, /response\.resume\(\)/)
assert.match(httpTransportSource, /AI_REQUEST_MAX_BYTES/)
assert.match(httpTransportSource, /AI_RESPONSE_MAX_BYTES/)
assert.match(serviceSource, /MAX_AI_OPTIMIZATION_BATCH = 300/)
assert.match(bookmarkCommandsSource, /if \(!ExtensionConfig\.ensureAIConfigured\(\)\) return undefined/)
assert.match(bookmarkCommandsSource, /ExtensionConfig\.updateAIAddress\(successfulAddress\)/)
assert.match(bookmarkCommandsSource, /aiGenerateSkipFolder\.command,[\s\S]*?withAIConfiguration/)
assert.match(bookmarkCommandsSource, /aiGenerateAppendFolderDirect\.command,[\s\S]*?withAIConfiguration/)
assert.match(bookmarkCommandsSource, /aiGenerateOverwriteFolderDirect\.command,[\s\S]*?withAIConfiguration/)
assert.match(bookmarkCommandsSource, /aiOptimizeFolder\.command,[\s\S]*?withAIConfiguration/)
assert.doesNotMatch(bookmarkCommandsSource, /aiUnavailable|ai\.unavailable/)
assert.match(serviceSource, /start \+= MAX_AI_OPTIMIZATION_BATCH/)
assert.match(httpTransportSource, /AI 请求总时长超过/)
