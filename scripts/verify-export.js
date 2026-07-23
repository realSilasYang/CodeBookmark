/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-export`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-export` 对应契约。
 * 核心边界：通过断言锁定“verify-export”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const commands = new Map(manifest.contributes.commands.map(command => [command.command, command]))
const directCommands = [
  ['codebookmark.exportToMarkdown', 'Markdown'],
  ['codebookmark.exportToHtml', 'HTML'],
  ['codebookmark.exportToCsv', 'CSV'],
  ['codebookmark.exportToText', '纯文本'],
  ['codebookmark.exportSourceFiles', '配置源文件'],
]
const batchCommands = [
  ['codebookmark.batchExportToMarkdown', 'Markdown'],
  ['codebookmark.batchExportToHtml', 'HTML'],
  ['codebookmark.batchExportToCsv', 'CSV'],
  ['codebookmark.batchExportToText', '纯文本'],
  ['codebookmark.batchExportSourceFiles', '配置源文件'],
]

for (const [commandId, title] of [...directCommands, ...batchCommands]) {
  assert.equal(commands.get(commandId)?.title, title, `导出命令标题不正确：${commandId}`)
}
assert.equal(commands.has('codebookmark.exportAll'), false, '聚合导出命令不应继续暴露')

const exportMenu = manifest.contributes.menus['codebookmark.exportSubmenu']
assert.deepEqual(
  exportMenu.map(item => item.command ?? item.submenu),
  [...directCommands.map(([commandId]) => commandId), 'codebookmark.batchExportSubmenu'],
  '导出子菜单的项目或顺序不正确',
)
assert.deepEqual(exportMenu.slice(0, 5).map(item => item.group), [
  '1_formats@1',
  '1_formats@2',
  '1_formats@3',
  '1_formats@4',
  '1_formats@5',
])
assert.equal(exportMenu[5].group, '2_batch@1', '批量导出入口上方应通过独立分组显示分隔线')

const batchMenu = manifest.contributes.menus['codebookmark.batchExportSubmenu']
assert.deepEqual(
  batchMenu.map(item => item.command),
  batchCommands.map(([commandId]) => commandId),
  '批量导出三级子菜单的项目或顺序不正确',
)
assert.equal(
  manifest.contributes.submenus.find(item => item.id === 'codebookmark.exportSubmenu')?.label,
  '导出书签为…',
)
assert.equal(
  manifest.contributes.submenus.find(item => item.id === 'codebookmark.batchExportSubmenu')?.label,
  '批量导出当前文件夹下…',
)
assert.equal(manifest.contributes.menus['codebookmark.moreSubmenu']
  .some(item => item.submenu === 'codebookmark.exportSubmenu'), true)
for (const [commandId] of batchCommands) {
  assert.equal(manifest.contributes.menus.commandPalette
    .some(item => item.command === commandId && item.when === 'false'), true, `批量命令不应重复显示在命令面板：${commandId}`)
}

const source = fs.readFileSync('src/commands/exportCommand.ts', 'utf8')
for (const marker of [
  'formatMarkdown',
  'formatHtml',
  'formatCsv',
  'formatText',
  'isSameOrDescendantAbsolutePath',
  'relativeSourcePath',
  '.bookmarks',
  '.codebookmark.json',
  '当前文件夹及其子目录',
]) {
  assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.match(source, /JSON\.stringify\(data, null, 2\)/, '配置源文件必须使用可读缩进')
assert.doesNotMatch(source, /书签 ID<\/th>/, '阅读版 HTML 不应突出内部书签 ID')
assert.doesNotMatch(source, /书签 ID'\]/, '阅读版 CSV 不应突出内部书签 ID')
assert.match(source, /code > 32 && \(code < 127 \|\| code > 159\)/, 'CSV 公式防护必须覆盖前导空白和控制字符')
assert.match(source, /'=\+-@'\.includes\(raw\[firstMeaningful\]/)

const commandsSource = fs.readFileSync('src/util/constants/Commands.ts', 'utf8')
assert.match(commandsSource, /batchExportSubmenuId/)
