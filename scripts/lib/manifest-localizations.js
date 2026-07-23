const {
  DEFAULT_AI_GENERATION_PROMPT,
  DEFAULT_AI_GENERATION_PROMPT_EN,
  DEFAULT_AI_OPTIMIZATION_PROMPT,
  DEFAULT_AI_OPTIMIZATION_PROMPT_EN,
} = require('../../out/util/constants/AIPrompts')
const { UNDO_ACTION_LABELS, UNDO_ACTION_LABELS_EN } = require('../../out/util/UndoActions')

const MARKETPLACE_DEFAULT_KEYS = Object.freeze([
  'codebookmark.displayName',
  'codebookmark.description',
])

// VS Code's official and long-standing non-Chinese display-language locales.
// Marketplace ignores the client locale, so package.nls.json supplies Chinese
// discovery metadata while these catalogs keep installed manifests in English.
const ENGLISH_MANIFEST_LOCALES = Object.freeze([
  'en',
  'bg',
  'cs',
  'de',
  'es',
  'fr',
  'hu',
  'it',
  'ja',
  'ko',
  'pl',
  'pt-br',
  'ru',
  'tr',
])

const englishByChineseText = new Map([
  ['代码书签 - CodeBookmark', 'CodeBookmark'],
  ['面向代码阅读与导航的智能书签。粘性引擎让书签持续绑定脚本，随代码编辑、文件改名和目录移动自动追随，无需反复校准；配置本地保存，AI 辅助生成书签、优化标签并匹配丰富图标，让关键逻辑一眼可见、随时直达。', 'Smart bookmarks for reading and navigating code. The sticky engine keeps bookmarks bound to scripts and automatically follows code edits, file renames, and folder moves—no manual recalibration required. Configurations stay local, while AI generates bookmarks, improves labels, and matches rich icons so important logic is easy to spot and instantly accessible.'],
  ['代码书签', 'Code Bookmarks'],
  ['暂无书签，按下 Ctrl+B 即刻添加！\n\n[导入书签配置文件](command:codebookmark.importBookmarkConfig)\n\n[查看使用说明](command:codebookmark.openHelp)', 'No bookmarks yet. Press Ctrl+B to add one instantly!\n\n[Import Bookmark Configuration](command:codebookmark.importBookmarkConfig)\n\n[View Documentation](command:codebookmark.openHelp)'],
  ['[查看使用说明](command:codebookmark.openHelp)', '[View Documentation](command:codebookmark.openHelp)'],
  ['添加/删除书签', 'Add/Remove Bookmark'],
  ['强制添加书签', 'Force Add Bookmark'],
  ['强制删除书签', 'Force Delete Bookmark'],
  ['删除', 'Delete'],
  ['重命名书签', 'Rename Bookmark'],
  ['更新书签位置到当前光标处（保留标签）', 'Move Bookmark to Cursor (Keep Label)'],
  ['更新书签位置到当前光标处（重命名标签）', 'Move Bookmark to Cursor (Rename Label)'],
  ['自定义书签图标', 'Customize Bookmark Icon'],
  ['恢复默认图标', 'Restore Default Icon'],
  ['设为当前文件的新书签容器', 'Use as New Bookmark Container for Current File'],
  ['取消新书签容器', 'Stop Using as New Bookmark Container'],
  ['撤销：暂无可撤销操作', 'Undo: Nothing to Undo'],
  ['重做：暂无可重做操作', 'Redo: Nothing to Redo'],
  ['当前文件内搜索', 'Search in Current File'],
  ['展开书签节点', 'Expand Bookmark Nodes'],
  ['折叠书签节点', 'Collapse Bookmark Nodes'],
  ['$(list-selection) 排序模式', '$(list-selection) Sort Mode'],
  ['$(settings) 代码书签设置', '$(settings) CodeBookmark Settings'],
  ['$(info) 使用说明', '$(info) Documentation'],
  ['导入书签配置文件', 'Import Bookmark Configuration'],
  ['$(files) 书签配置文件管理', '$(files) Manage Bookmark Configurations'],
  ['$(add) 追加', '$(add) Append'],
  ['$(replace) 重新生成并替换', '$(replace) Regenerate and Replace'],
  ['$(diff-added) 生成', '$(diff-added) Generate'],
  ['$(hubot) 当前脚本', '$(hubot) Current Script'],
  ['$(hubot) 优化当前脚本的书签标签', '$(hubot) Improve Bookmark Labels in Current Script'],
  ['$(hubot) 优化当前文件夹内有书签的脚本中的书签标签', '$(hubot) Improve Labels in Bookmarked Scripts in Current Folder'],
  ['$(hubot) 优化选中书签的标签', '$(hubot) Improve Selected Bookmark Labels'],
  ['$(hubot) 选中的书签', '$(hubot) Selected Bookmarks'],
  ['$(add) 为有书签的脚本追加', '$(add) Append to Bookmarked Scripts'],
  ['$(replace) 为有书签的脚本重新生成并替换', '$(replace) Regenerate and Replace in Bookmarked Scripts'],
  ['$(add) 为当前文件夹内有书签的脚本追加', '$(add) Append to Bookmarked Scripts in Current Folder'],
  ['$(replace) 为当前文件夹内有书签的脚本重新生成并替换', '$(replace) Regenerate and Replace in Bookmarked Scripts in Current Folder'],
  ['$(diff-added) 为所有无书签脚本生成', '$(diff-added) Generate for All Unbookmarked Scripts'],
  ['$(diff-added) 为当前文件夹内无书签脚本生成', '$(diff-added) Generate for Unbookmarked Scripts in Current Folder'],
  ['$(hubot) 当前文件夹内有书签的脚本', '$(hubot) Bookmarked Scripts in Current Folder'],
  ['$(hubot) AI 优化书签标签', '$(hubot) Improve Bookmark Labels with AI'],
  ['测试 AI 连接', 'Test AI Connection'],
  ['$(settings) AI 配置', '$(settings) AI Settings'],
  ['纯文本', 'Plain Text'],
  ['配置源文件', 'Configuration Source'],
  ['$(trash) 清除失效书签', '$(trash) Clear Invalid Bookmarks'],
  ['编辑书签', 'Edit Bookmark'],
  ['更多', 'More'],
  ['导出书签为…', 'Export Bookmarks As…'],
  ['批量导出当前文件夹下…', 'Batch Export Current Folder As…'],
  ['AI 辅助', 'AI Assistance'],
  ['生成书签', 'Generate Bookmarks'],
  ['当前脚本', 'Current Script'],
  ['当前文件夹', 'Current Folder'],
  ['优化书签标签', 'Improve Bookmark Labels'],
  ['代码书签设置', 'CodeBookmark Settings'],
  ['书签配置目录的绝对路径（必填，支持 ~ 和 %ENV%）', 'Absolute path to the bookmark configuration directory (required; supports ~ and %ENV%).'],
  ['展开/折叠按钮的默认展开级别。设为 3 表示展开时显示前三级书签；设为 0 表示展开全部层级。', 'Default expansion level used by the expand/collapse button. Set to 3 to show the first three bookmark levels when expanding, or 0 to expand all levels.'],
  ['是否在书签标签的中英文/数字之间自动插入空格，优化排版显示。', 'Automatically insert spacing between Chinese text and Latin letters or numbers in bookmark labels.'],
  ['在光标所在行的代码末尾显示书签标签的幽灵文本（类似 GitLens 的行内注释效果）。', 'Show the bookmark label as ghost text at the end of the line containing the cursor, similar to GitLens inline annotations.'],
  ['支持资源地址、API Base URL 和完整请求 URL，插件会自动识别并补全。远程服务请使用 HTTPS。', 'Accepts resource endpoints, API base URLs, and complete request URLs. The extension detects the format and completes the request address automatically. Use HTTPS for remote services.'],
  ['AI 接口密钥', 'AI API key.'],
  ['AI 模型名称。配置接口地址及所需密钥后可 [验证 AI 连接](command:codebookmark.ai.testConnection)', 'AI model name. After configuring the address and any required key, you can [test the AI connection](command:codebookmark.ai.testConnection).'],
  ['让 AI 在生成书签后选择书签图标', 'Let AI choose bookmark icons after generating bookmarks.'],
  ['AI 请求超时时间（秒，范围 1–600）', 'AI request timeout in seconds (1–600).'],
  ['AI 自动提取书签的系统提示词。', 'System prompt used by AI to generate bookmarks.'],
  ['AI 优化书签标签和语义图标时的提示词。', 'Prompt used by AI to improve bookmark labels and semantic icons.'],
  ['一级书签颜色', 'Level 1 bookmark color.'],
  ['二级书签颜色', 'Level 2 bookmark color.'],
  [DEFAULT_AI_GENERATION_PROMPT, DEFAULT_AI_GENERATION_PROMPT_EN],
  [DEFAULT_AI_OPTIMIZATION_PROMPT, DEFAULT_AI_OPTIMIZATION_PROMPT_EN],
])

const englishUndoLabels = new Map(Object.keys(UNDO_ACTION_LABELS)
  .map(action => [UNDO_ACTION_LABELS[action], UNDO_ACTION_LABELS_EN[action]]))

function translateManifestText(chinese) {
  const direct = englishByChineseText.get(chinese)
  if (direct !== undefined) return direct
  const history = /^(撤销|重做)：(.+)$/.exec(chinese)
  if (!history) return undefined
  const action = englishUndoLabels.get(history[2])
  if (!action) return undefined
  return `${history[1] === '撤销' ? 'Undo' : 'Redo'}: ${action}`
}

module.exports = {
  ENGLISH_MANIFEST_LOCALES,
  MARKETPLACE_DEFAULT_KEYS,
  translateManifestText,
}
