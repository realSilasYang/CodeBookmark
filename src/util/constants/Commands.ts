/**
 * 集中声明扩展命令 ID、上下文键和菜单分组，供运行时注册与清单生成共同引用。
 * 这些字符串构成公开兼容面；改名会影响快捷键、菜单 when 条件和用户已有绑定。
 */
import { ContextBookmark } from '../ContextValue'
import { messages as defaultMessages } from '../../i18n/catalogs/zh-cn'
import { UNDO_ACTION_MESSAGE_KEYS } from '../UndoActions'

export class Commands {
	static readonly nameExtension = 'codebookmark'

	static readonly varHasBookmark = 'bookmarks.var.bookmark.hasBookmark'
	static readonly varActiveFileAvailable = 'codebookmark.activeFileAvailable'
	static readonly varActiveFileHasBookmark = 'codebookmark.activeFileHasBookmark'
	static readonly varAIAnalysisAvailable = 'codebookmark.aiAnalysisAvailable'
	static readonly whenAIAnalysisAvailable = `(${Commands.varAIAnalysisAvailable} && isWorkspaceTrusted)`
	static readonly varCurrentFolderHasUnbookmarkedScript = 'codebookmark.currentFolderHasUnbookmarkedScript'
	static readonly varCurrentFolderHasBookmarkedScript = 'codebookmark.currentFolderHasBookmarkedScript'
	static readonly whenWorkspaceFolderOpen = 'workspaceFolderCount > 0'
	static readonly whenCurrentFolderHasAIScript = `(${Commands.varCurrentFolderHasUnbookmarkedScript} || ${Commands.varCurrentFolderHasBookmarkedScript})`
	static readonly whenActiveBookmarkedFile = `(${Commands.varActiveFileAvailable} && ${Commands.varActiveFileHasBookmark})`
	static readonly whenAIFolderTarget = `(${Commands.whenWorkspaceFolderOpen} && ${Commands.whenCurrentFolderHasAIScript})`
	static readonly whenBookmarkedFolderTarget = `(${Commands.whenWorkspaceFolderOpen} && ${Commands.varCurrentFolderHasBookmarkedScript})`
	static readonly varCanUndo = 'bookmarks.var.bookmark.canUndo'
	static readonly varCanRedo = 'bookmarks.var.bookmark.canRedo'
	static readonly varUndoOperation = 'bookmarks.var.bookmark.undoOperation'
	static readonly varRedoOperation = 'bookmarks.var.bookmark.redoOperation'
	static readonly varBookmarkLoaded = 'bookmarks.var.bookmark.loaded'
	static readonly varBookmarkLoadFailed = 'bookmarks.var.bookmark.loadFailed'
	static readonly varIsExpanded = 'codebookmark.var.isExpanded'
	static readonly varHasMultipleSelection = 'codebookmark.hasMultipleSelection'

	static get codeBookmarkViewName() { return Commands.nameExtension + 'TreeView' }

	static get openBookmark() { return Commands.nameExtension + '.openBookmark' }

	static viewCodeBookmarkView = `(view == ${this.codeBookmarkViewName})`
	static codeMarkerOnTree = `(viewItem == ${ContextBookmark.CodeMarkerDefault} || viewItem == ${ContextBookmark.CodeMarkerCustom})`
	static pinnedBookmarkOnTree = `(viewItem == ${ContextBookmark.BookmarkPinned} || viewItem == ${ContextBookmark.CodeMarkerPinnedDefault} || viewItem == ${ContextBookmark.CodeMarkerPinnedCustom})`
	static bookmarkOnTree = `(viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.BookmarkInvalid} || ${this.codeMarkerOnTree})`
	static editableBookmarkOnTree = `(${this.bookmarkOnTree} || ${this.pinnedBookmarkOnTree})`
	static deletableBookmarkOnTree = `(viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.BookmarkInvalid} || viewItem == ${ContextBookmark.BookmarkPinned})`
	static restoreDefaultIconOnTree = `(viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.BookmarkPinned} || viewItem == ${ContextBookmark.CodeMarkerCustom} || viewItem == ${ContextBookmark.CodeMarkerPinnedCustom})`
	static fileOnTree = `(viewItem == ${ContextBookmark.File} || viewItem == ${ContextBookmark.FileCustom})`
	static pinnedFileOnTree = `(viewItem == ${ContextBookmark.FilePinned} || viewItem == ${ContextBookmark.FilePinnedCustom})`
	static editableTreeNode = `(${this.editableBookmarkOnTree} || ${this.fileOnTree} || ${this.pinnedFileOnTree})`
	static deletableTreeNode = `(${this.deletableBookmarkOnTree} || ${this.fileOnTree} || ${this.pinnedFileOnTree})`
	static customIconTreeNode = `(${this.restoreDefaultIconOnTree} || viewItem == ${ContextBookmark.FileCustom} || viewItem == ${ContextBookmark.FilePinnedCustom})`

	static indexStatusBarButton = {
		undo: 1,
		redo: 2,
		aiGenerate: 3,
		searchInFile: 4,
		toggleExpand: 5
	}

	static undoCommands = Object.entries(UNDO_ACTION_MESSAGE_KEYS).map(([action, messageKey]) => ({
		command: `${Commands.nameExtension}.undo.${action}`,
		title: `撤销：${defaultMessages[messageKey]}`,
		icon: '$(discard)',
		when: `${Commands.viewCodeBookmarkView} && ${Commands.varUndoOperation} == ${action}`,
		enablement: Commands.varCanUndo,
		category: '代码书签',
		group: `navigation@${Commands.indexStatusBarButton.undo}`,
	}))

	static redoCommands = Object.entries(UNDO_ACTION_MESSAGE_KEYS).map(([action, messageKey]) => ({
		command: `${Commands.nameExtension}.redo.${action}`,
		title: `重做：${defaultMessages[messageKey]}`,
		icon: '$(redo)',
		when: `${Commands.viewCodeBookmarkView} && ${Commands.varRedoOperation} == ${action}`,
		enablement: Commands.varCanRedo,
		category: '代码书签',
		group: `navigation@${Commands.indexStatusBarButton.redo}`,
	}))

	static bookmarkCommands = {
		// 直接作用于活动编辑器和当前光标的命令。
		toggleBookmark: {
			'command': Commands.nameExtension + '.toggleBookmark',
			'title': '添加/删除书签',
			'key': 'ctrl+b',
			"category": "代码书签",
			'when': 'editorTextFocus',
		},
		forceAddBookmark: {
			'command': Commands.nameExtension + '.forceAddBookmark',
			'title': '强制添加书签',
			'key': 'ctrl+alt+shift+b',
			"category": "代码书签",
			'when': 'editorTextFocus',
		},
		forceDeleteBookmark: {
			'command': Commands.nameExtension + '.forceDeleteBookmark',
			'title': '强制删除书签',
			'key': 'ctrl+alt+shift+d',
			"category": "代码书签",
			'when': 'editorTextFocus',
		},

		// 由树节点行内图标触发、会携带当前 TreeItem 的命令。
		deleteBookmark: {
			'command': Commands.nameExtension + '.deleteBookmark',
			'title': '删除',
			'icon': '$(trash)',
			'when': `${this.viewCodeBookmarkView} && ${this.deletableTreeNode}`,
			'group': 'inline@4'
		},
		editBookmark_editLabel: {
			'command': Commands.nameExtension + '.editBookmark.editLabel',
			'title': '重命名书签',
			'category': '代码书签'
		},
		editBookmark_updatePosOnly: {
			'command': Commands.nameExtension + '.editBookmark.updatePosOnly',
			'title': '更新书签位置到当前光标处（保留标签）',
			'category': '代码书签'
		},
		editBookmark_updatePosAndRename: {
			'command': Commands.nameExtension + '.editBookmark.updatePosAndRename',
			'title': '更新书签位置到当前光标处（重命名标签）',
			'category': '代码书签'
		},
		editBookmark_changeIcon: {
			'command': Commands.nameExtension + '.editBookmark.changeIcon',
			'title': '自定义书签图标',
			'category': '代码书签'
		},
		editBookmark_restoreDefaultIcon: {
			'command': Commands.nameExtension + '.editBookmark.restoreDefaultIcon',
			'title': '恢复默认图标',
			'category': '代码书签'
		},
		renameBookmark: {
			'command': Commands.nameExtension + '.renameBookmark',
			'title': '重命名书签',
			'key': 'f2',
			'when': `listFocus && focusedView == '${Commands.codeBookmarkViewName}'`,
			'category': "代码书签"
		},
		pinView: {
			'command': Commands.nameExtension + '.pinView',
			'title': '设置为书签容器',
			'icon': '$(folder-opened)',
			'when': `${this.viewCodeBookmarkView} && (viewItem == ${ContextBookmark.Bookmark} || ${this.codeMarkerOnTree} || ${this.fileOnTree}) && !${this.varHasMultipleSelection}`,
			'group': 'inline@2'
		},
		unpinView: {
			'command': Commands.nameExtension + '.unpinView',
			'title': '取消作为书签容器',
			'icon': '$(folder)',
			'when': `${this.viewCodeBookmarkView} && (${this.pinnedBookmarkOnTree} || ${this.pinnedFileOnTree}) && !${this.varHasMultipleSelection}`,
			'group': 'inline@2'
		},

		// 书签视图标题栏中的全局操作。
		undo: {
			'command': Commands.nameExtension + '.undo',
			'title': '撤销：暂无可撤销操作',
			'icon': '$(discard)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varCanUndo}`,
			'category': "代码书签",
			'group': `navigation@${this.indexStatusBarButton.undo}`
		},
		redo: {
			'command': Commands.nameExtension + '.redo',
			'title': '重做：暂无可重做操作',
			'icon': '$(redo)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varCanRedo}`,
			'category': "代码书签",
			'group': `navigation@${this.indexStatusBarButton.redo}`
		},
		searchInFile: {
			'command': Commands.nameExtension + '.bookmark.searchInFile',
			'title': '当前文件内搜索',
			'icon': '$(search)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varHasBookmark}`,
			"category": "代码书签",
			"group": `navigation@${this.indexStatusBarButton.searchInFile}`,
		},
		toggleExpandCollapse: {
			'command': Commands.nameExtension + '.toggleExpandCollapse',
			'title': '展开书签节点',
			'icon': '$(expand-all)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varHasBookmark}`,
			"category": "代码书签",
			"group": `navigation@${this.indexStatusBarButton.toggleExpand}`,
		},
		toggleExpandCollapse_collapse: {
			'command': Commands.nameExtension + '.collapseToLevel',
			'title': '折叠书签节点',
			'icon': '$(collapse-all)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varHasBookmark}`,
			"category": "代码书签",
			"group": `navigation@${this.indexStatusBarButton.toggleExpand}`,
		},
		sort: {
			'command': Commands.nameExtension + '.bookmark.sort',
			'title': '$(list-selection) 排序模式',
			'icon': '$(list-selection)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varHasBookmark}`,
			"category": "代码书签",
		},
		openSettings: {
			'command': Commands.nameExtension + '.openSettings',
			'title': '$(settings) 代码书签设置',
			'icon': '$(settings)',
			'when': `${this.viewCodeBookmarkView}`,
			"category": "代码书签"
		},
		openHelp: {
			'command': Commands.nameExtension + '.openHelp',
			'title': '$(info) 使用说明',
			'icon': '$(info)',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "代码书签"
		},
		importPortablePackage: {
			'command': Commands.nameExtension + '.importPortablePackage',
			'title': '导入可迁移书签配置',
			'icon': '$(file-symlink-file)',
			"category": "代码书签"
		},
		manageBookmarkConfigurations: {
			'command': Commands.nameExtension + '.manageBookmarkConfigurations',
			'title': '$(files) 书签配置文件管理',
			'icon': '$(files)',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "代码书签"
		},
		aiGenerateAppend: {
			'command': Commands.nameExtension + '.ai.generateAppend',
			'title': '$(add) 追加',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiGenerateOverwrite: {
			'command': Commands.nameExtension + '.ai.generateOverwrite',
			'title': '$(replace) 重新生成并替换',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiGenerateSkip: {
			'command': Commands.nameExtension + '.ai.generateSkip',
			'title': '$(diff-added) 生成',
			'when': `${Commands.viewCodeBookmarkView} && !${Commands.varActiveFileHasBookmark}`,
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiOptimize: {
			'command': Commands.nameExtension + '.ai.optimize',
			'title': '$(hubot) 当前脚本',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiOptimizeDirect: {
			'command': Commands.nameExtension + '.ai.optimizeDirect',
			'title': '$(hubot) 优化当前脚本的书签标签',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiOptimizeFolderDirect: {
			'command': Commands.nameExtension + '.ai.optimizeFolderDirect',
			'title': '$(hubot) 优化当前文件夹内有书签的脚本中的书签标签',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiOptimizeSelectedDirect: {
			'command': Commands.nameExtension + '.ai.optimizeSelectedDirect',
			'title': '$(hubot) 优化选中书签的标签',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiOptimizeSelected: {
			'command': Commands.nameExtension + '.ai.optimizeSelected',
			'title': '$(hubot) 选中的书签',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiGenerateAppendFolder: {
			'command': Commands.nameExtension + '.ai.generateAppendFolder',
			'title': '$(add) 为有书签的脚本追加',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiGenerateOverwriteFolder: {
			'command': Commands.nameExtension + '.ai.generateOverwriteFolder',
			'title': '$(replace) 为有书签的脚本重新生成并替换',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiGenerateAppendFolderDirect: {
			'command': Commands.nameExtension + '.ai.generateAppendFolderDirect',
			'title': '$(add) 为当前文件夹内有书签的脚本追加',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiGenerateOverwriteFolderDirect: {
			'command': Commands.nameExtension + '.ai.generateOverwriteFolderDirect',
			'title': '$(replace) 为当前文件夹内有书签的脚本重新生成并替换',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiGenerateSkipFolder: {
			'command': Commands.nameExtension + '.ai.generateSkipFolder',
			'title': '$(diff-added) 为所有无书签脚本生成',
			'when': `${Commands.viewCodeBookmarkView} && ${Commands.varCurrentFolderHasUnbookmarkedScript}`,
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiGenerateSkipFolderDirect: {
			'command': Commands.nameExtension + '.ai.generateSkipFolderDirect',
			'title': '$(diff-added) 为当前文件夹内无书签脚本生成',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiOptimizeFolder: {
			'command': Commands.nameExtension + '.ai.optimizeFolder',
			'title': '$(hubot) 当前文件夹内有书签的脚本',
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiOptimizeContextItem: {
			'command': Commands.nameExtension + '.ai.optimizeContextItem',
			'title': '$(hubot) AI 优化书签标签',
			'when': `${Commands.viewCodeBookmarkView} && ${Commands.editableBookmarkOnTree}`,
			'enablement': Commands.whenAIAnalysisAvailable,
			"category": "代码书签"
		},
		aiTestConnection: {
			'command': Commands.nameExtension + '.ai.testConnection',
			'title': '测试 AI 连接',
			'icon': '$(debug-disconnect)',
			"category": "代码书签",
		},
		aiOpenSettings: {
			'command': Commands.nameExtension + '.ai.openSettings',
			'title': '$(settings) AI 配置',
			'icon': '$(settings)',
			"category": "代码书签",
		},
		exportToMarkdown: {
			'command': Commands.nameExtension + '.exportToMarkdown',
			'title': 'Markdown',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		exportToHtml: {
			'command': Commands.nameExtension + '.exportToHtml',
			'title': 'HTML',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		exportToCsv: {
			'command': Commands.nameExtension + '.exportToCsv',
			'title': 'CSV',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		exportToText: {
			'command': Commands.nameExtension + '.exportToText',
			'title': '纯文本',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		exportPortablePackage: {
			'command': Commands.nameExtension + '.exportPortablePackage',
			'title': '可迁移书签配置',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		batchExportPortablePackage: {
			'command': Commands.nameExtension + '.batchExportPortablePackage',
			'title': '可迁移书签配置',
			'when': `${Commands.viewCodeBookmarkView} && ${Commands.whenWorkspaceFolderOpen}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		batchExportToMarkdown: {
			'command': Commands.nameExtension + '.batchExportToMarkdown',
			'title': 'Markdown',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		batchExportToHtml: {
			'command': Commands.nameExtension + '.batchExportToHtml',
			'title': 'HTML',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		batchExportToCsv: {
			'command': Commands.nameExtension + '.batchExportToCsv',
			'title': 'CSV',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		batchExportToText: {
			'command': Commands.nameExtension + '.batchExportToText',
			'title': '纯文本',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "代码书签"
		},
		clearInvalidBookmarks: {
			'command': Commands.nameExtension + '.clearInvalidBookmarks',
			'title': '$(trash) 清除失效书签',
			'when': `bookmarks.var.bookmark.hasInvalid`,
			'category': '代码书签'
		}
	}

	static readonly codebookmark = [
		{
			"id": Commands.codeBookmarkViewName,
			"name": "代码书签",
			"icon": "resources/bookmark.svg",
			"contextualTitle": "代码书签"
		}
	]

	static readonly editSubmenuId = 'codebookmark.editSubmenu'
	static readonly moreSubmenuId = 'codebookmark.moreSubmenu'
	static readonly exchangeSubmenuId = 'codebookmark.exchangeSubmenu'
	static readonly exportSubmenuId = 'codebookmark.exportSubmenu'
	static readonly exportCurrentScriptSubmenuId = 'codebookmark.exportCurrentScriptSubmenu'
	static readonly exportOtherFormatsSubmenuId = 'codebookmark.exportOtherFormatsSubmenu'
	static readonly exportCurrentFolderSubmenuId = 'codebookmark.exportCurrentFolderSubmenu'
	static readonly exportCurrentFolderOtherFormatsSubmenuId = 'codebookmark.exportCurrentFolderOtherFormatsSubmenu'
	static readonly aiSubmenuId = 'codebookmark.aiSubmenu'
	static readonly aiGenerateSubmenuId = 'codebookmark.aiGenerateSubmenu'
	static readonly aiGenerateWorkspaceSubmenuId = 'codebookmark.aiGenerateWorkspaceSubmenu'
	static readonly aiGenerateFileSubmenuId = 'codebookmark.aiGenerateFileSubmenu'
	static readonly aiGenerateFolderSubmenuId = 'codebookmark.aiGenerateFolderSubmenu'
	static readonly aiOptimizeSubmenuId = 'codebookmark.aiOptimizeSubmenu'

	static submenus = [
		{
			"id": this.editSubmenuId,
			"label": "编辑书签",
			"icon": "$(edit)"
		},
		{
			"id": this.moreSubmenuId,
			"label": "更多",
			"icon": "$(three-bars)"
		},
		{
			"id": this.exchangeSubmenuId,
			"label": "导入/导出书签",
			"icon": "$(arrow-swap)"
		},
		{
			"id": this.exportSubmenuId,
			"label": "导出"
		},
		{
			"id": this.exportCurrentScriptSubmenuId,
			"label": "导出当前脚本的…"
		},
		{
			"id": this.exportOtherFormatsSubmenuId,
			"label": "其他格式"
		},
		{
			"id": this.exportCurrentFolderSubmenuId,
			"label": "导出当前文件夹的…"
		},
		{
			"id": this.exportCurrentFolderOtherFormatsSubmenuId,
			"label": "其他格式"
		},
		{
			"id": this.aiSubmenuId,
			"label": "AI 辅助",
			"icon": "$(symbol-event)"
		},
		{
			"id": this.aiGenerateSubmenuId,
			"label": "生成书签"
		},
		{
			"id": this.aiGenerateWorkspaceSubmenuId,
			"label": "生成书签"
		},
		{
			"id": this.aiGenerateFileSubmenuId,
			"label": "当前脚本"
		},
		{
			"id": this.aiGenerateFolderSubmenuId,
			"label": "当前文件夹"
		},
		{
			"id": this.aiOptimizeSubmenuId,
			"label": "优化书签标签"
		}
	]

	static editSubmenu_items = [
		{ command: this.bookmarkCommands.editBookmark_editLabel.command, when: `viewItem != ${ContextBookmark.BookmarkInvalid}`, group: "1_modification@1" },
		{ command: this.bookmarkCommands.editBookmark_changeIcon.command, when: `viewItem != ${ContextBookmark.BookmarkInvalid}`, group: "1_modification@2" },
		{ command: this.bookmarkCommands.editBookmark_updatePosOnly.command, when: `!${this.fileOnTree} && !${this.pinnedFileOnTree}`, group: "2_position@1" },
		{ command: this.bookmarkCommands.editBookmark_updatePosAndRename.command, when: `!${this.fileOnTree} && !${this.pinnedFileOnTree}`, group: "2_position@2" }
	]

	static moreSubmenu_items = [
		{ command: this.bookmarkCommands.clearInvalidBookmarks.command, group: "0_clear@1", when: this.bookmarkCommands.clearInvalidBookmarks.when },
		{ command: this.bookmarkCommands.sort.command, group: "1_primary@1" },
		{ submenu: this.exchangeSubmenuId, group: "1_primary@2" },
		{ command: this.bookmarkCommands.manageBookmarkConfigurations.command, group: "2_secondary@1" },
		{ command: this.bookmarkCommands.openHelp.command, group: "2_secondary@2" },
		{ command: this.bookmarkCommands.openSettings.command, group: "2_secondary@3" }
	]

	static exchangeSubmenu_items = [
		{ command: this.bookmarkCommands.importPortablePackage.command, group: "1_items@1" },
		{
			submenu: this.exportSubmenuId,
			group: "1_items@2",
			when: `workspaceFolderCount == 0 && ${this.whenActiveBookmarkedFile}`,
		},
		{
			submenu: this.exportCurrentScriptSubmenuId,
			group: "1_items@2",
			when: `${this.whenWorkspaceFolderOpen} && ${this.whenActiveBookmarkedFile}`,
		},
		{
			submenu: this.exportCurrentFolderSubmenuId,
			group: "1_items@3",
			when: `${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasBookmarkedScript}`,
		},
	]

	static exportSubmenu_items = [
		{ command: this.bookmarkCommands.exportPortablePackage.command, group: "1_items@1" },
		{ submenu: this.exportOtherFormatsSubmenuId, group: "1_items@2" },
	]

	static exportCurrentScriptSubmenu_items = this.exportSubmenu_items

	static exportOtherFormatsSubmenu_items = [
		{ command: this.bookmarkCommands.exportToMarkdown.command, group: "1_formats@1" },
		{ command: this.bookmarkCommands.exportToHtml.command, group: "1_formats@2" },
		{ command: this.bookmarkCommands.exportToCsv.command, group: "1_formats@3" },
		{ command: this.bookmarkCommands.exportToText.command, group: "1_formats@4" },
	]

	static exportCurrentFolderSubmenu_items = [
		{ command: this.bookmarkCommands.batchExportPortablePackage.command, group: "1_items@1" },
		{ submenu: this.exportCurrentFolderOtherFormatsSubmenuId, group: "1_items@2" },
	]

	static exportCurrentFolderOtherFormatsSubmenu_items = [
		{ command: this.bookmarkCommands.batchExportToMarkdown.command, group: "1_items@1" },
		{ command: this.bookmarkCommands.batchExportToHtml.command, group: "1_items@2" },
		{ command: this.bookmarkCommands.batchExportToCsv.command, group: "1_items@3" },
		{ command: this.bookmarkCommands.batchExportToText.command, group: "1_items@4" },
	]

	static aiSubmenu_items = [
		{
			submenu: this.aiGenerateSubmenuId,
			group: "1_items@1",
			when: `${this.whenAIAnalysisAvailable} && ${this.varActiveFileAvailable} && (${this.varActiveFileHasBookmark} || ${this.whenAIFolderTarget})`,
		},
		{
			submenu: this.aiGenerateWorkspaceSubmenuId,
			group: "1_items@1",
			when: `${this.whenAIAnalysisAvailable} && !${this.varActiveFileAvailable} && ${this.whenBookmarkedFolderTarget}`,
		},
		{
			command: this.bookmarkCommands.aiGenerateSkip.command,
			group: "1_items@1",
			when: `${this.whenAIAnalysisAvailable} && ${this.varActiveFileAvailable} && !${this.varActiveFileHasBookmark} && !${this.whenAIFolderTarget}`,
		},
		{
			command: this.bookmarkCommands.aiGenerateSkipFolderDirect.command,
			group: "1_items@1",
			when: `${this.whenAIAnalysisAvailable} && !${this.varActiveFileAvailable} && ${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasUnbookmarkedScript} && !${this.varCurrentFolderHasBookmarkedScript}`,
		},
		{
			submenu: this.aiOptimizeSubmenuId,
			group: "1_items@2",
			when: `${this.whenAIAnalysisAvailable} && ((${this.whenActiveBookmarkedFile} && ${this.whenBookmarkedFolderTarget}) || (${this.whenActiveBookmarkedFile} && codebookmark.hasSelection) || (${this.whenBookmarkedFolderTarget} && codebookmark.hasSelection))`,
		},
		{
			command: this.bookmarkCommands.aiOptimizeDirect.command,
			group: "1_items@2",
			when: `${this.whenAIAnalysisAvailable} && ${this.whenActiveBookmarkedFile} && !codebookmark.hasSelection && !${this.whenBookmarkedFolderTarget}`,
		},
		{
			command: this.bookmarkCommands.aiOptimizeFolderDirect.command,
			group: "1_items@2",
			when: `${this.whenAIAnalysisAvailable} && ${this.whenBookmarkedFolderTarget} && !${this.whenActiveBookmarkedFile} && !codebookmark.hasSelection`,
		},
		{
			command: this.bookmarkCommands.aiOptimizeSelectedDirect.command,
			group: "1_items@2",
			when: `${this.whenAIAnalysisAvailable} && ${this.whenWorkspaceFolderOpen} && codebookmark.hasSelection && !${this.whenActiveBookmarkedFile} && !${this.whenBookmarkedFolderTarget}`,
		},
		{ command: this.bookmarkCommands.aiOpenSettings.command, group: "2_configuration@1" },
	]

	static aiGenerateSubmenu_items = [
		{
			submenu: this.aiGenerateFileSubmenuId,
			group: "1_items@1",
			when: `${this.whenAIFolderTarget} && ${this.whenActiveBookmarkedFile}`,
		},
		{
			command: this.bookmarkCommands.aiGenerateSkip.command,
			group: "1_items@1",
			when: `${this.whenAIFolderTarget} && ${this.varActiveFileAvailable} && !${this.varActiveFileHasBookmark}`,
		},
		{
			submenu: this.aiGenerateFolderSubmenuId,
			group: "1_items@2",
			when: `${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasBookmarkedScript}`,
		},
		{
			command: this.bookmarkCommands.aiGenerateSkipFolderDirect.command,
			group: "1_items@2",
			when: `${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasUnbookmarkedScript} && !${this.varCurrentFolderHasBookmarkedScript}`,
		},
		{
			command: this.bookmarkCommands.aiGenerateAppend.command,
			group: "1_items@1",
			when: `${this.whenActiveBookmarkedFile} && !${this.whenAIFolderTarget}`,
		},
		{
			command: this.bookmarkCommands.aiGenerateOverwrite.command,
			group: "1_items@2",
			when: `${this.whenActiveBookmarkedFile} && !${this.whenAIFolderTarget}`,
		},
	]

	static aiGenerateFileSubmenu_items = [
		{ command: this.bookmarkCommands.aiGenerateAppend.command, group: "1_items@1", when: this.whenActiveBookmarkedFile },
		{ command: this.bookmarkCommands.aiGenerateOverwrite.command, group: "1_items@2", when: this.whenActiveBookmarkedFile },
	]

	static aiGenerateFolderSubmenu_items = [
		{ command: this.bookmarkCommands.aiGenerateSkipFolder.command, group: "1_items@1", when: `${this.whenWorkspaceFolderOpen} && ${this.bookmarkCommands.aiGenerateSkipFolder.when}` },
		{ command: this.bookmarkCommands.aiGenerateAppendFolder.command, group: "1_items@2", when: `${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasBookmarkedScript}` },
		{ command: this.bookmarkCommands.aiGenerateOverwriteFolder.command, group: "1_items@3", when: `${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasBookmarkedScript}` }
	]

	static aiGenerateWorkspaceSubmenu_items = [
		{ command: this.bookmarkCommands.aiGenerateSkipFolderDirect.command, group: "1_items@1", when: `${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasUnbookmarkedScript}` },
		{ command: this.bookmarkCommands.aiGenerateAppendFolderDirect.command, group: "1_items@2", when: `${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasBookmarkedScript}` },
		{ command: this.bookmarkCommands.aiGenerateOverwriteFolderDirect.command, group: "1_items@3", when: `${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasBookmarkedScript}` },
	]

	static aiOptimizeSubmenu_items = [
		{ command: this.bookmarkCommands.aiOptimizeSelected.command, group: "4_optimize@1", when: "codebookmark.hasSelection" },
		{ command: this.bookmarkCommands.aiOptimize.command, group: "4_optimize@2", when: this.whenActiveBookmarkedFile },
		{ command: this.bookmarkCommands.aiOptimizeFolder.command, group: "4_optimize@3", when: this.whenBookmarkedFolderTarget }
	]

	static view_title = [
		{
			...this.bookmarkCommands.undo,
			when: `${this.viewCodeBookmarkView} && !${this.varUndoOperation}`,
		},
		...this.undoCommands,
		{
			...this.bookmarkCommands.redo,
			when: `${this.viewCodeBookmarkView} && !${this.varRedoOperation}`,
		},
		...this.redoCommands,
		{
			"submenu": this.aiSubmenuId,
			"when": this.viewCodeBookmarkView,
			"group": `navigation@${this.indexStatusBarButton.aiGenerate}`
		},
		this.bookmarkCommands.searchInFile,
		{
			"command": this.bookmarkCommands.toggleExpandCollapse.command,
			"when": `${this.viewCodeBookmarkView} && !${this.varIsExpanded}`,
			"group": `navigation@${this.indexStatusBarButton.toggleExpand}`
		},
		{
			"command": this.bookmarkCommands.toggleExpandCollapse_collapse.command,
			"when": `${this.viewCodeBookmarkView} && ${this.varIsExpanded}`,
			"group": `navigation@${this.indexStatusBarButton.toggleExpand}`
		},
		{
			"submenu": this.moreSubmenuId,
			"when": `${this.viewCodeBookmarkView}`,
			"group": `navigation@99`
		}
	]

	static command_palette = [
		{ command: this.bookmarkCommands.aiOptimizeDirect.command, when: 'false' },
		{ command: this.bookmarkCommands.aiOptimizeFolderDirect.command, when: 'false' },
		{ command: this.bookmarkCommands.aiOptimizeSelectedDirect.command, when: 'false' },
		{ command: this.bookmarkCommands.aiGenerateAppendFolderDirect.command, when: 'false' },
		{ command: this.bookmarkCommands.aiGenerateOverwriteFolderDirect.command, when: 'false' },
		{ command: this.bookmarkCommands.aiGenerateSkipFolderDirect.command, when: 'false' },
		{ command: this.bookmarkCommands.aiTestConnection.command, when: 'false' },
		...this.undoCommands.map(command => ({ command: command.command, when: 'false' })),
		...this.redoCommands.map(command => ({ command: command.command, when: 'false' })),
		...[
			this.bookmarkCommands.batchExportToMarkdown,
			this.bookmarkCommands.batchExportToHtml,
			this.bookmarkCommands.batchExportToCsv,
			this.bookmarkCommands.batchExportToText,
			this.bookmarkCommands.batchExportPortablePackage,
		].map(command => ({ command: command.command, when: 'false' })),
	]

	static view_item_context = [
		this.bookmarkCommands.pinView,
		this.bookmarkCommands.unpinView,
		{
			"submenu": this.editSubmenuId,
			"when": `${this.viewCodeBookmarkView} && ${this.editableTreeNode}`,
			"group": "inline@3"
		},
		this.bookmarkCommands.deleteBookmark,
		{
			"command": this.bookmarkCommands.editBookmark_editLabel.command,
			"when": `${this.viewCodeBookmarkView} && ${this.editableTreeNode}`,
			"group": "1_edit@1"
		},
		{
			"command": this.bookmarkCommands.editBookmark_changeIcon.command,
			"when": `${this.viewCodeBookmarkView} && ${this.editableTreeNode}`,
			"group": "1_edit@2"
		},
		{
			"command": this.bookmarkCommands.editBookmark_restoreDefaultIcon.command,
			"when": `${this.viewCodeBookmarkView} && ${this.customIconTreeNode}`,
			"group": "1_edit@3"
		},
		{
			"command": this.bookmarkCommands.aiOptimizeContextItem.command,
			"when": this.bookmarkCommands.aiOptimizeContextItem.when,
			"group": "1_edit@4"
		}
	]

	static editor_context = [
		{
			"command": this.bookmarkCommands.toggleBookmark.command,
			"group": "codebookmark@1",
			"when": this.bookmarkCommands.forceAddBookmark.when
		},
		{
			"command": this.bookmarkCommands.forceAddBookmark.command,
			"group": "codebookmark@2",
			"when": this.bookmarkCommands.forceAddBookmark.when
		},
		{
			"command": this.bookmarkCommands.forceDeleteBookmark.command,
			"group": "codebookmark@3",
			"when": this.bookmarkCommands.forceAddBookmark.when
		}
	]

	static configuration = [
		{
			"type": "object",
			"title": "代码书签设置",
			"properties": {
				"codebookmark.globalStoragePath": {
					"order": 1,
					"type": "string",
					"default": "",
					"description": "书签配置目录的绝对路径（必填，支持 ~ 和 %ENV%）"
				},
				"codebookmark.defaultExpandLevel": {
					"order": 2,
					"type": "integer",
					"default": 3,
					"minimum": 0,
					"description": "展开/折叠按钮的默认展开级别。设为 3 表示展开时显示前三级书签；设为 0 表示展开全部层级。"
				},
				"codebookmark.autoSpace": {
					"order": 3,
					"type": "boolean",
					"default": true,
					"description": "是否在书签标签的中英文/数字之间自动插入空格，优化排版显示。"
				},
				"codebookmark.inlineLabel": {
					"order": 4,
					"type": "boolean",
					"default": true,
					"description": "在光标所在行的代码末尾显示书签标签的幽灵文本（类似 GitLens 的行内注释效果）。"
				},
				"codebookmark.AI.address": {
					"order": 5,
					"type": "string",
					"default": "",
					"description": "支持资源地址、API Base URL 和完整请求 URL，插件会自动识别并补全。远程服务请使用 HTTPS。"
				},
				"codebookmark.AI.APIKey": {
					"order": 6,
					"type": "string",
					"default": "",
					"description": "AI 接口密钥"
				},
				"codebookmark.AI.model": {
					"order": 7,
					"type": "string",
					"default": "",
					"markdownDescription": "AI 模型名称。配置接口地址及所需密钥后可 [验证 AI 连接](command:codebookmark.ai.testConnection)"
				},
				"codebookmark.AI.assignIcons": {
					"order": 8,
					"type": "boolean",
					"default": true,
					"description": "让 AI 在生成书签后选择书签图标"
				},
				"codebookmark.AI.timeoutS": {
					"order": 9,
					"type": "integer",
					"default": 60,
					"minimum": 1,
					"maximum": 600,
					"description": "AI 请求超时时间（秒，范围 1–600）"
				},
				"codebookmark.AI.prompt": {
					"order": 10,
					"type": "string",
					"editPresentation": "multilineText",
					"default": defaultMessages['ai.prompt.generation'],
					"description": "AI 自动提取书签的系统提示词。"
				},
				"codebookmark.AI.optimizePrompt": {
					"order": 11,
					"type": "string",
					"editPresentation": "multilineText",
					"default": defaultMessages['ai.prompt.optimization'],
					"description": "AI 优化书签标签和语义图标时的提示词。"
				}
			}
		}
	]

	static keybindings = [
		{
			"command": Commands.nameExtension + ".deleteBookmark",
			"key": "delete",
			"when": `listFocus && focusedView == '${Commands.codeBookmarkViewName}'`
		},
		this.bookmarkCommands.renameBookmark,
		this.bookmarkCommands.toggleBookmark,
		this.bookmarkCommands.forceAddBookmark,
		this.bookmarkCommands.forceDeleteBookmark,
		{
			"command": "workbench.view.extension.codebookmark",
			"key": "alt+b"
		}
	]
}
