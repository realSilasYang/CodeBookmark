/**
 * 核对所有由 VS Code 以纯文字呈现的下拉菜单，确保命令和子菜单都有语义符号。
 * 标题栏与树节点行内按钮继续使用真正的 Codicon；这里只覆盖会经过 stripIcons 的次级菜单。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { discoverManifestCatalogs } = require('./lib/manifest-language-catalogs')
const { loadLocalizedManifest } = require('./lib/localized-manifest')
const {
	MENU_COMMAND_SYMBOLS,
	MENU_SYMBOL_SEPARATOR,
	MENU_SUBMENU_SYMBOLS,
	prefixMenuSymbol,
} = require('./lib/manifest-menu-symbols')

const sourceCatalogs = discoverManifestCatalogs(path.join(__dirname, 'i18n', 'catalogs'))
const chineseManifest = loadLocalizedManifest('zh-cn')

assert.equal(MENU_SYMBOL_SEPARATOR, '\u3000', '菜单符号与文案之间必须使用一个全角空格')
assert.equal(prefixMenuSymbol('菜单', '◆'), '◆\u3000菜单', '菜单符号前缀格式必须保持稳定')
assert.equal(prefixMenuSymbol('菜单'), '菜单', '没有符号时不得改变菜单文案')

function dropdownReferences(manifest) {
	const commandIds = new Set()
	const submenuIds = new Set()
	for (const [menuId, items] of Object.entries(manifest.contributes.menus)) {
		const isExtensionSubmenu = menuId.startsWith('codebookmark.')
		const isEditorContextMenu = menuId === 'editor/context'
		const isTreeContextMenu = menuId === 'view/item/context'
		if (!isExtensionSubmenu && !isEditorContextMenu && !isTreeContextMenu) continue
		for (const item of items) {
			// inline 组由树节点右侧的图标按钮承载，不经过文字下拉菜单。
			if (isTreeContextMenu && item.group?.startsWith('inline')) continue
			if (item.command) commandIds.add(item.command)
			if (item.submenu) submenuIds.add(item.submenu)
		}
	}
	return { commandIds, submenuIds }
}

const references = dropdownReferences(chineseManifest)
assert.deepEqual(
	[...Object.keys(MENU_COMMAND_SYMBOLS)].sort(),
	[...references.commandIds].sort(),
	'下拉菜单命令与 Unicode 符号映射必须完全一致',
)
assert.deepEqual(
	[...Object.keys(MENU_SUBMENU_SYMBOLS)].sort(),
	[...references.submenuIds].sort(),
	'嵌套子菜单与 Unicode 符号映射必须完全一致',
)

for (const [locale, sourceMessages] of sourceCatalogs) {
	for (const [key, value] of Object.entries(sourceMessages)) {
		if (!key.includes('.contributes.commands.') && !key.includes('.contributes.submenus.')) continue
		assert.doesNotMatch(value, /^\$\([^)]+\)\s/u, `${locale} 源文案仍含无法显示的标题 Codicon：${key}`)
	}

	const manifest = loadLocalizedManifest(locale)
	const commands = new Map(manifest.contributes.commands.map(command => [command.command, command.title]))
	const submenus = new Map(manifest.contributes.submenus.map(submenu => [submenu.id, submenu.label]))
	for (const [commandId, symbol] of Object.entries(MENU_COMMAND_SYMBOLS)) {
		assertExactMenuPrefix(commands.get(commandId) ?? '', symbol, `${locale} 下拉菜单命令：${commandId}`)
	}
	for (const [submenuId, symbol] of Object.entries(MENU_SUBMENU_SYMBOLS)) {
		assertExactMenuPrefix(submenus.get(submenuId) ?? '', symbol, `${locale} 下拉子菜单：${submenuId}`)
	}
	for (const title of commands.values()) assert.doesNotMatch(title, /^\$\([^)]+\)\s/u)
	for (const label of submenus.values()) assert.doesNotMatch(label, /^\$\([^)]+\)\s/u)
}

const commands = new Map(chineseManifest.contributes.commands.map(command => [command.command, command]))
for (const commandId of [
	'codebookmark.bookmark.sort',
	'codebookmark.importPortablePackage',
	'codebookmark.manageBookmarkConfigurations',
	'codebookmark.openHelp',
	'codebookmark.openSettings',
	'codebookmark.ai.openSettings',
]) {
	assert.match(commands.get(commandId)?.icon ?? '', /^\$\([a-z0-9-]+\)$/u, `可渲染位置的 Codicon 不应丢失：${commandId}`)
}

function assertExactMenuPrefix(value, symbol, description) {
	const prefix = `${symbol}${MENU_SYMBOL_SEPARATOR}`
	assert.ok(value.startsWith(prefix), `${description} 缺少符号或一个全角空格`)
	assert.match(value.slice(prefix.length), /^\S/u, `${description} 的文案前不得出现额外空白`)
}

console.log(`菜单符号验证通过：${references.commandIds.size} 个命令，${references.submenuIds.size} 个子菜单，${sourceCatalogs.size} 种语言`)
