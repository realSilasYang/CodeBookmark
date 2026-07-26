/**
 * 核对“导入/导出书签”的菜单层级、便携包入口与四种可读格式，阻止旧 JSON 配置源导出回归。
 * 同时锁定文件夹导出的路径基准，避免子目录被重复拼接后漏掉本应导出的脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadLocalizedManifest } = require('./lib/localized-manifest')

const manifest = loadLocalizedManifest('zh-cn')
const commands = new Map(manifest.contributes.commands.map(command => [command.command, command]))
const readable = [
  ['codebookmark.exportToMarkdown', 'Markdown'],
  ['codebookmark.exportToHtml', 'HTML'],
  ['codebookmark.exportToCsv', 'CSV'],
  ['codebookmark.exportToText', '纯文本'],
]
const batchReadable = [
  ['codebookmark.batchExportToMarkdown', 'Markdown'],
  ['codebookmark.batchExportToHtml', 'HTML'],
  ['codebookmark.batchExportToCsv', 'CSV'],
  ['codebookmark.batchExportToText', '纯文本'],
]
for (const [commandId, title] of [...readable, ...batchReadable]) {
  assert.equal(commands.get(commandId)?.title, title, `导出命令标题不正确：${commandId}`)
}
assert.equal(commands.get('codebookmark.importPortablePackage')?.title, '导入可迁移书签配置')
assert.equal(commands.get('codebookmark.exportPortablePackage')?.title, '可迁移书签配置')
assert.equal(commands.get('codebookmark.batchExportPortablePackage')?.title, '可迁移书签配置')
assert.equal([...commands.keys()].some(command => /SourceFiles$/u.test(command)), false)

const menus = manifest.contributes.menus
const singleScriptExportWhen = 'workspaceFolderCount == 0 && (codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark)'
const currentScriptExportWhen = 'workspaceFolderCount > 0 && (codebookmark.activeFileAvailable && codebookmark.activeFileHasBookmark)'
const currentFolderExportWhen = 'workspaceFolderCount > 0 && codebookmark.currentFolderHasBookmarkedScript'
assert.deepEqual(menus['codebookmark.exchangeSubmenu'].map(item => item.command ?? item.submenu), [
  'codebookmark.importPortablePackage',
  'codebookmark.exportSubmenu',
  'codebookmark.exportCurrentScriptSubmenu',
  'codebookmark.exportCurrentFolderSubmenu',
])
assert.equal(
  menus['codebookmark.exchangeSubmenu'][1].when,
  singleScriptExportWhen,
)
assert.equal(
  menus['codebookmark.exchangeSubmenu'][2].when,
  currentScriptExportWhen,
)
assert.equal(
  menus['codebookmark.exchangeSubmenu'][3].when,
  currentFolderExportWhen,
)

const exportVisibility = new Map([
  [singleScriptExportWhen, state => state.workspaceFolderCount === 0 && state.activeFileAvailable && state.activeFileHasBookmark],
  [currentScriptExportWhen, state => state.workspaceFolderCount > 0 && state.activeFileAvailable && state.activeFileHasBookmark],
  [currentFolderExportWhen, state => state.workspaceFolderCount > 0 && state.currentFolderHasBookmarkedScript],
])
const exportItems = menus['codebookmark.exchangeSubmenu'].filter(item => item.submenu?.includes('export'))
const visibleExports = state => exportItems
  .filter(item => exportVisibility.get(item.when)?.(state))
  .map(item => item.submenu)
for (const workspaceFolderCount of [0, 1]) {
  for (const activeFileAvailable of [false, true]) {
    for (const activeFileHasBookmark of [false, true]) {
      for (const currentFolderHasBookmarkedScript of [false, true]) {
        const state = { workspaceFolderCount, activeFileAvailable, activeFileHasBookmark, currentFolderHasBookmarkedScript }
        const activeBookmarkedFile = activeFileAvailable && activeFileHasBookmark
        const expected = workspaceFolderCount === 0
          ? activeBookmarkedFile ? ['codebookmark.exportSubmenu'] : []
          : [
              ...(activeBookmarkedFile ? ['codebookmark.exportCurrentScriptSubmenu'] : []),
              ...(currentFolderHasBookmarkedScript ? ['codebookmark.exportCurrentFolderSubmenu'] : []),
            ]
        assert.deepEqual(visibleExports(state), expected, `导出菜单状态组合不正确：${JSON.stringify(state)}`)
      }
    }
  }
}
assert.deepEqual(menus['codebookmark.exportSubmenu'].map(item => item.command ?? item.submenu), [
  'codebookmark.exportPortablePackage',
  'codebookmark.exportOtherFormatsSubmenu',
])
assert.deepEqual(menus['codebookmark.exportCurrentScriptSubmenu'], menus['codebookmark.exportSubmenu'])
assert.deepEqual(
  menus['codebookmark.exportOtherFormatsSubmenu'].map(item => item.command),
  readable.map(([commandId]) => commandId),
)
assert.deepEqual(menus['codebookmark.exportCurrentFolderSubmenu'].map(item => item.command ?? item.submenu), [
  'codebookmark.batchExportPortablePackage',
  'codebookmark.exportCurrentFolderOtherFormatsSubmenu',
])
assert.deepEqual(
  menus['codebookmark.exportCurrentFolderOtherFormatsSubmenu'].map(item => item.command),
  batchReadable.map(([commandId]) => commandId),
)
assert.equal(manifest.contributes.submenus.find(item => item.id === 'codebookmark.exchangeSubmenu')?.label, '导入/导出书签')
assert.equal(manifest.contributes.submenus.find(item => item.id === 'codebookmark.exportSubmenu')?.label, '导出')
assert.equal(manifest.contributes.submenus.find(item => item.id === 'codebookmark.exportCurrentScriptSubmenu')?.label, '导出当前脚本的…')
assert.equal(manifest.contributes.submenus.find(item => item.id === 'codebookmark.exportCurrentFolderSubmenu')?.label, '导出当前文件夹的…')
assert.equal(menus['codebookmark.moreSubmenu'].some(item => item.submenu === 'codebookmark.exchangeSubmenu'), true)
for (const [commandId] of batchReadable) {
  assert.equal(menus.commandPalette.some(item => item.command === commandId && item.when === 'false'), true)
}
assert.equal(menus.commandPalette.some(item => item.command === 'codebookmark.batchExportPortablePackage' && item.when === 'false'), true)
assert.equal(menus.commandPalette.some(item => item.command === 'codebookmark.exportPortablePackage'), false)

const source = fs.readFileSync('src/commands/exportCommand.ts', 'utf8')
const portableExportSource = fs.readFileSync('src/portable/PortableExport.ts', 'utf8')
assert.match(portableExportSource, /const sourceScopeRoot = scopeRoot\(snapshot\)/)
assert.match(portableExportSource, /fileUtils\.relativeToAbsolute\(projection\.path, vscode\.Uri\.file\(sourceScopeRoot\)\)/)
assert.doesNotMatch(portableExportSource, /fileUtils\.relativeToAbsolute\(projection\.path, vscode\.Uri\.file\(rootPath\)\)/)
for (const marker of [
  'formatMarkdown', 'formatHtml', 'formatCsv', 'formatText',
  'preparePortableExport', 'PORTABLE_PACKAGE_EXTENSION', 'currentFolderForExport',
  'isSameOrDescendantAbsolutePath', 'relativeSourcePath', '.bookmarks',
]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
assert.doesNotMatch(source, /SourceFiles|copyFile/u)
assert.match(source, /const rollbackRecord = await writePortableExchangeRecord/)
assert.match(source, /catch \(error\) \{[\s\S]*?await rollbackRecord\(\)[\s\S]*?throw error/)
assert.doesNotMatch(source, /书签 ID<\/th>|书签 ID'\]/)
assert.match(source, /code > 32 && \(code < 127 \|\| code > 159\)/)
assert.match(source, /'=\+-@'\.includes\(raw\[firstMeaningful\]/)
