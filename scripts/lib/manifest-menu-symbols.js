/**
 * 为 VS Code 会按纯文字渲染的下拉菜单提供稳定的 Unicode 符号。
 * 符号与翻译分离：语言目录只维护文案，生成 package.nls 时统一添加前缀。
 */
const MENU_COMMAND_SYMBOLS = Object.freeze({
	'codebookmark.ai.generateAppend': '⊕',
	'codebookmark.ai.generateAppendFolder': '⊕',
	'codebookmark.ai.generateAppendFolderDirect': '⊕',
	'codebookmark.ai.generateOverwrite': '↻',
	'codebookmark.ai.generateOverwriteFolder': '↻',
	'codebookmark.ai.generateOverwriteFolderDirect': '↻',
	'codebookmark.ai.generateSkip': '✦',
	'codebookmark.ai.generateSkipFolder': '✦',
	'codebookmark.ai.generateSkipFolderDirect': '✦',
	'codebookmark.ai.openSettings': '⚙',
	'codebookmark.ai.optimize': '✎',
	'codebookmark.ai.optimizeContextItem': '✎',
	'codebookmark.ai.optimizeDirect': '✎',
	'codebookmark.ai.optimizeFolder': '✎',
	'codebookmark.ai.optimizeFolderDirect': '✎',
	'codebookmark.ai.optimizeSelected': '✎',
	'codebookmark.ai.optimizeSelectedDirect': '✎',
	'codebookmark.batchExportPortablePackage': '⇄',
	'codebookmark.batchExportToCsv': '▦',
	'codebookmark.batchExportToHtml': '⟨⟩',
	'codebookmark.batchExportToMarkdown': '#',
	'codebookmark.batchExportToText': '≡',
	'codebookmark.bookmark.sort': '⇅',
	'codebookmark.clearInvalidBookmarks': '✕',
	'codebookmark.editBookmark.changeIcon': '◈',
	'codebookmark.editBookmark.editLabel': '✎',
	'codebookmark.editBookmark.restoreDefaultIcon': '↺',
	'codebookmark.editBookmark.updatePosAndRename': '⌖',
	'codebookmark.editBookmark.updatePosOnly': '⌖',
	'codebookmark.exportPortablePackage': '⇄',
	'codebookmark.exportToCsv': '▦',
	'codebookmark.exportToHtml': '⟨⟩',
	'codebookmark.exportToMarkdown': '#',
	'codebookmark.exportToText': '≡',
	'codebookmark.forceAddBookmark': '⊕',
	'codebookmark.forceDeleteBookmark': '⊖',
	'codebookmark.importPortablePackage': '↙',
	'codebookmark.manageBookmarkConfigurations': '▤',
	'codebookmark.openHelp': 'ⓘ',
	'codebookmark.openSettings': '⚙',
	'codebookmark.toggleBookmark': '◆',
})

const MENU_SUBMENU_SYMBOLS = Object.freeze({
	'codebookmark.aiGenerateFileSubmenu': '▧',
	'codebookmark.aiGenerateFolderSubmenu': '▣',
	'codebookmark.aiGenerateSubmenu': '✦',
	'codebookmark.aiGenerateWorkspaceSubmenu': '✦',
	'codebookmark.aiOptimizeSubmenu': '✎',
	'codebookmark.exchangeSubmenu': '⇄',
	'codebookmark.exportCurrentFolderOtherFormatsSubmenu': '⋯',
	'codebookmark.exportCurrentFolderSubmenu': '▣',
	'codebookmark.exportCurrentScriptSubmenu': '▧',
	'codebookmark.exportOtherFormatsSubmenu': '⋯',
	'codebookmark.exportSubmenu': '↗',
})

function commandTitleKey(commandId) {
	return `codebookmark.contributes.commands.${commandId}.title`
}

function submenuLabelKey(submenuId) {
	return `codebookmark.contributes.submenus.${submenuId}.label`
}

function menuSymbolForMessageKey(key) {
	for (const [commandId, symbol] of Object.entries(MENU_COMMAND_SYMBOLS)) {
		if (key === commandTitleKey(commandId)) return symbol
	}
	for (const [submenuId, symbol] of Object.entries(MENU_SUBMENU_SYMBOLS)) {
		if (key === submenuLabelKey(submenuId)) return symbol
	}
	return undefined
}

function menuSymbolForManifestPath(pathSegments) {
	if (pathSegments[0] !== 'contributes') return undefined
	if (pathSegments[1] === 'commands' && pathSegments[3] === 'title') {
		return MENU_COMMAND_SYMBOLS[pathSegments[2]]
	}
	if (pathSegments[1] === 'submenus' && pathSegments[3] === 'label') {
		return MENU_SUBMENU_SYMBOLS[pathSegments[2]]
	}
	return undefined
}

// 原生菜单无法单独调整符号字号；固定使用一个全角空格稳定分隔符号与文案。
const MENU_SYMBOL_SEPARATOR = '\u3000'

function prefixMenuSymbol(value, symbol) {
	return symbol ? `${symbol}${MENU_SYMBOL_SEPARATOR}${value}` : value
}

function decorateManifestMessages(messages) {
	const decorated = { ...messages }
	for (const key of Object.keys(messages)) {
		decorated[key] = prefixMenuSymbol(messages[key], menuSymbolForMessageKey(key))
	}
	return Object.freeze(decorated)
}

module.exports = {
	MENU_COMMAND_SYMBOLS,
	MENU_SYMBOL_SEPARATOR,
	MENU_SUBMENU_SYMBOLS,
	decorateManifestMessages,
	menuSymbolForManifestPath,
	prefixMenuSymbol,
}
