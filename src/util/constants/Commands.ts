import { ContextBookmark } from '../ContextValue'
import { DEFAULT_AI_GENERATION_PROMPT, DEFAULT_AI_OPTIMIZATION_PROMPT } from './AIPrompts'
import { UNDO_ACTION_LABELS } from '../UndoActions'

export class Commands {
	static readonly nameExtension = 'codebookmark'

	static readonly varHasBookmark = 'bookmarks.var.bookmark.hasBookmark'
	static readonly varActiveFileAvailable = 'codebookmark.activeFileAvailable'
	static readonly varActiveFileHasBookmark = 'codebookmark.activeFileHasBookmark'
	static readonly varAIAnalysisAvailable = 'codebookmark.aiAnalysisAvailable'
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

	static get codeBookmarkViewName() { return Commands.nameExtension + 'TreeView' }

	static get openBookmark() { return Commands.nameExtension + '.openBookmark' }

	static viewCodeBookmarkView = `(view == ${this.codeBookmarkViewName})`
	static codeMarkerOnTree = `(viewItem == ${ContextBookmark.CodeMarkerDefault} || viewItem == ${ContextBookmark.CodeMarkerCustom})`
	static pinnedBookmarkOnTree = `(viewItem == ${ContextBookmark.BookmarkPinned} || viewItem == ${ContextBookmark.CodeMarkerPinnedDefault} || viewItem == ${ContextBookmark.CodeMarkerPinnedCustom})`
	static bookmarkOnTree = `(viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.BookmarkInvalid} || ${this.codeMarkerOnTree})`
	static editableBookmarkOnTree = `(${this.bookmarkOnTree} || ${this.pinnedBookmarkOnTree})`
	static deletableBookmarkOnTree = `(viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.BookmarkInvalid} || viewItem == ${ContextBookmark.BookmarkPinned})`
	static restoreDefaultIconOnTree = `(viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.BookmarkPinned} || viewItem == ${ContextBookmark.CodeMarkerCustom} || viewItem == ${ContextBookmark.CodeMarkerPinnedCustom})`

	static indexStatusBarButton = {
		undo: 1,
		redo: 2,
		aiGenerate: 3,
		searchInFile: 4,
		toggleExpand: 5
	}

	static undoCommands = Object.entries(UNDO_ACTION_LABELS).map(([action, label]) => ({
		command: `${Commands.nameExtension}.undo.${action}`,
		title: `撤销：${label}`,
		icon: '$(discard)',
		when: `${Commands.viewCodeBookmarkView} && ${Commands.varUndoOperation} == ${action}`,
		enablement: Commands.varCanUndo,
		category: 'Code Bookmarks',
		group: `navigation@${Commands.indexStatusBarButton.undo}`,
	}))

	static redoCommands = Object.entries(UNDO_ACTION_LABELS).map(([action, label]) => ({
		command: `${Commands.nameExtension}.redo.${action}`,
		title: `重做：${label}`,
		icon: '$(redo)',
		when: `${Commands.viewCodeBookmarkView} && ${Commands.varRedoOperation} == ${action}`,
		enablement: Commands.varCanRedo,
		category: 'Code Bookmarks',
		group: `navigation@${Commands.indexStatusBarButton.redo}`,
	}))

	static bookmarkCommands = {
		// keyboard shortcut
		toggleBookmark: {
			'command': Commands.nameExtension + '.toggleBookmark',
			'title': '添加/删除书签',
			'key': 'ctrl+b',
			"category": "Code Bookmarks",
			'when': 'editorTextFocus',
		},
		forceAddBookmark: {
			'command': Commands.nameExtension + '.forceAddBookmark',
			'title': '强制添加书签',
			'key': 'ctrl+alt+shift+b',
			"category": "Code Bookmarks",
			'when': 'editorTextFocus',
		},
		forceDeleteBookmark: {
			'command': Commands.nameExtension + '.forceDeleteBookmark',
			'title': '强制删除书签',
			'key': 'ctrl+alt+shift+d',
			"category": "Code Bookmarks",
			'when': 'editorTextFocus',
		},

		// Button on item
		deleteBookmark: {
			'command': Commands.nameExtension + '.deleteBookmark',
			'title': '删除',
			'icon': '$(trash)',
			'when': `${this.viewCodeBookmarkView} && ${this.deletableBookmarkOnTree}`,
			'group': 'inline@4'
		},
		editBookmark_editLabel: {
			'command': Commands.nameExtension + '.editBookmark.editLabel',
			'title': '重命名书签',
			'category': 'Code Bookmarks'
		},
		editBookmark_updatePosOnly: {
			'command': Commands.nameExtension + '.editBookmark.updatePosOnly',
			'title': '更新书签位置到当前光标处（保留标签）',
			'category': 'Code Bookmarks'
		},
		editBookmark_updatePosAndRename: {
			'command': Commands.nameExtension + '.editBookmark.updatePosAndRename',
			'title': '更新书签位置到当前光标处（重命名标签）',
			'category': 'Code Bookmarks'
		},
		editBookmark_changeIcon: {
			'command': Commands.nameExtension + '.editBookmark.changeIcon',
			'title': '自定义书签图标',
			'category': 'Code Bookmarks'
		},
		editBookmark_restoreDefaultIcon: {
			'command': Commands.nameExtension + '.editBookmark.restoreDefaultIcon',
			'title': '恢复默认图标',
			'category': 'Code Bookmarks'
		},
		renameBookmark: {
			'command': Commands.nameExtension + '.renameBookmark',
			'title': '重命名书签',
			'key': 'f2',
			'when': `listFocus && focusedView == '${Commands.codeBookmarkViewName}'`,
			'category': "Code Bookmarks"
		},
		pinView: {
			'command': Commands.nameExtension + '.pinView',
			'title': '设为当前文件的新书签容器',
			'icon': '$(folder-opened)',
			'when': `${this.viewCodeBookmarkView} && (viewItem == ${ContextBookmark.Bookmark} || ${this.codeMarkerOnTree})`,
			'group': 'inline@2'
		},
		unpinView: {
			'command': Commands.nameExtension + '.unpinView',
			'title': '取消新书签容器',
			'icon': '$(folder)',
			'when': `${this.viewCodeBookmarkView} && ${this.pinnedBookmarkOnTree}`,
			'group': 'inline@2'
		},

		// Top Bar Buttons
		undo: {
			'command': Commands.nameExtension + '.undo',
			'title': '撤销：暂无可撤销操作',
			'icon': '$(discard)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varCanUndo}`,
			'category': "Code Bookmarks",
			'group': `navigation@${this.indexStatusBarButton.undo}`
		},
		redo: {
			'command': Commands.nameExtension + '.redo',
			'title': '重做：暂无可重做操作',
			'icon': '$(redo)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varCanRedo}`,
			'category': "Code Bookmarks",
			'group': `navigation@${this.indexStatusBarButton.redo}`
		},
		searchInFile: {
			'command': Commands.nameExtension + '.bookmark.searchInFile',
			'title': '当前文件内搜索',
			'icon': '$(search)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varHasBookmark}`,
			"category": "Code Bookmarks",
			"group": `navigation@${this.indexStatusBarButton.searchInFile}`,
		},
		toggleExpandCollapse: {
			'command': Commands.nameExtension + '.toggleExpandCollapse',
			'title': '展开书签节点',
			'icon': '$(expand-all)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varHasBookmark}`,
			"category": "Code Bookmarks",
			"group": `navigation@${this.indexStatusBarButton.toggleExpand}`,
		},
		toggleExpandCollapse_collapse: {
			'command': Commands.nameExtension + '.collapseToLevel',
			'title': '折叠书签节点',
			'icon': '$(collapse-all)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varHasBookmark}`,
			"category": "Code Bookmarks",
			"group": `navigation@${this.indexStatusBarButton.toggleExpand}`,
		},
		sort: {
			'command': Commands.nameExtension + '.bookmark.sort',
			'title': '$(list-selection) 排序模式',
			'icon': '$(list-selection)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varHasBookmark}`,
			"category": "Code Bookmarks",
		},
		openSettings: {
			'command': Commands.nameExtension + '.openSettings',
			'title': '$(settings) 代码书签设置',
			'icon': '$(settings)',
			'when': `${this.viewCodeBookmarkView}`,
			"category": "Code Bookmarks"
		},
		openHelp: {
			'command': Commands.nameExtension + '.openHelp',
			'title': '$(info) 使用说明',
			'icon': '$(info)',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "Code Bookmarks"
		},
		importBookmarkConfig: {
			'command': Commands.nameExtension + '.importBookmarkConfig',
			'title': '导入书签配置文件',
			'icon': '$(file-symlink-file)',
			'enablement': `!${Commands.varActiveFileHasBookmark}`,
			"category": "Code Bookmarks"
		},
		manageBookmarkConfigurations: {
			'command': Commands.nameExtension + '.manageBookmarkConfigurations',
			'title': '$(files) 书签配置文件管理',
			'icon': '$(files)',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "Code Bookmarks"
		},
		aiGenerateAppend: {
			'command': Commands.nameExtension + '.ai.generateAppend',
			'title': '$(add) 追加',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiGenerateOverwrite: {
			'command': Commands.nameExtension + '.ai.generateOverwrite',
			'title': '$(replace) 重新生成并替换',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiGenerateSkip: {
			'command': Commands.nameExtension + '.ai.generateSkip',
			'title': '$(diff-added) 生成',
			'when': `${Commands.viewCodeBookmarkView} && !${Commands.varActiveFileHasBookmark}`,
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiOptimize: {
			'command': Commands.nameExtension + '.ai.optimize',
			'title': '$(hubot) 当前脚本',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiOptimizeDirect: {
			'command': Commands.nameExtension + '.ai.optimizeDirect',
			'title': '$(hubot) 优化当前脚本的书签标签',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiOptimizeFolderDirect: {
			'command': Commands.nameExtension + '.ai.optimizeFolderDirect',
			'title': '$(hubot) 优化当前文件夹内有书签的脚本中的书签标签',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiOptimizeSelectedDirect: {
			'command': Commands.nameExtension + '.ai.optimizeSelectedDirect',
			'title': '$(hubot) 优化选中书签的标签',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiOptimizeSelected: {
			'command': Commands.nameExtension + '.ai.optimizeSelected',
			'title': '$(hubot) 选中的书签',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiGenerateAppendFolder: {
			'command': Commands.nameExtension + '.ai.generateAppendFolder',
			'title': '$(add) 为有书签的脚本追加',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiGenerateOverwriteFolder: {
			'command': Commands.nameExtension + '.ai.generateOverwriteFolder',
			'title': '$(replace) 为有书签的脚本重新生成并替换',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiGenerateAppendFolderDirect: {
			'command': Commands.nameExtension + '.ai.generateAppendFolderDirect',
			'title': '$(add) 为当前文件夹内有书签的脚本追加',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiGenerateOverwriteFolderDirect: {
			'command': Commands.nameExtension + '.ai.generateOverwriteFolderDirect',
			'title': '$(replace) 为当前文件夹内有书签的脚本重新生成并替换',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiGenerateSkipFolder: {
			'command': Commands.nameExtension + '.ai.generateSkipFolder',
			'title': '$(diff-added) 为所有无书签脚本生成',
			'when': `${Commands.viewCodeBookmarkView} && ${Commands.varCurrentFolderHasUnbookmarkedScript}`,
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiGenerateSkipFolderDirect: {
			'command': Commands.nameExtension + '.ai.generateSkipFolderDirect',
			'title': '$(diff-added) 为当前文件夹内无书签脚本生成',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiOptimizeFolder: {
			'command': Commands.nameExtension + '.ai.optimizeFolder',
			'title': '$(hubot) 当前文件夹内有书签的脚本',
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiOptimizeContextItem: {
			'command': Commands.nameExtension + '.ai.optimizeContextItem',
			'title': '$(hubot) AI 优化书签标签',
			'when': `${Commands.viewCodeBookmarkView} && ${Commands.editableBookmarkOnTree}`,
			'enablement': Commands.varAIAnalysisAvailable,
			"category": "Code Bookmarks"
		},
		aiTestConnection: {
			'command': Commands.nameExtension + '.ai.testConnection',
			'title': '测试 AI 连接',
			'icon': '$(debug-disconnect)',
			"category": "Code Bookmarks",
		},
		aiOpenSettings: {
			'command': Commands.nameExtension + '.ai.openSettings',
			'title': '$(settings) AI 配置',
			'icon': '$(settings)',
			"category": "Code Bookmarks",
		},
		exportToMarkdown: {
			'command': Commands.nameExtension + '.exportToMarkdown',
			'title': 'Markdown',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		exportToHtml: {
			'command': Commands.nameExtension + '.exportToHtml',
			'title': 'HTML',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		exportToCsv: {
			'command': Commands.nameExtension + '.exportToCsv',
			'title': 'CSV',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		exportToText: {
			'command': Commands.nameExtension + '.exportToText',
			'title': '纯文本',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		exportSourceFiles: {
			'command': Commands.nameExtension + '.exportSourceFiles',
			'title': '配置源文件',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		batchExportToMarkdown: {
			'command': Commands.nameExtension + '.batchExportToMarkdown',
			'title': 'Markdown',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		batchExportToHtml: {
			'command': Commands.nameExtension + '.batchExportToHtml',
			'title': 'HTML',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		batchExportToCsv: {
			'command': Commands.nameExtension + '.batchExportToCsv',
			'title': 'CSV',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		batchExportToText: {
			'command': Commands.nameExtension + '.batchExportToText',
			'title': '纯文本',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		batchExportSourceFiles: {
			'command': Commands.nameExtension + '.batchExportSourceFiles',
			'title': '配置源文件',
			'when': `${Commands.viewCodeBookmarkView}`,
			'enablement': `${Commands.varHasBookmark}`,
			"category": "Code Bookmarks"
		},
		clearInvalidBookmarks: {
			'command': Commands.nameExtension + '.clearInvalidBookmarks',
			'title': '$(trash) 清除失效书签',
			'when': `bookmarks.var.bookmark.hasInvalid`,
			'category': 'Code Bookmarks'
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
	static readonly exportSubmenuId = 'codebookmark.exportSubmenu'
	static readonly batchExportSubmenuId = 'codebookmark.batchExportSubmenu'
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
			"id": this.exportSubmenuId,
			"label": "导出书签为…",
			"icon": "$(export)"
		},
		{
			"id": this.batchExportSubmenuId,
			"label": "批量导出当前文件夹下…"
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
		{ command: this.bookmarkCommands.editBookmark_updatePosOnly.command, group: "2_position@1" },
		{ command: this.bookmarkCommands.editBookmark_updatePosAndRename.command, group: "2_position@2" }
	]

	static moreSubmenu_items = [
		{ command: this.bookmarkCommands.clearInvalidBookmarks.command, group: "0_clear@1", when: this.bookmarkCommands.clearInvalidBookmarks.when },
		{ command: this.bookmarkCommands.sort.command, group: "1_primary@1" },
		{ submenu: this.exportSubmenuId, group: "1_primary@2" },
		{ command: this.bookmarkCommands.manageBookmarkConfigurations.command, group: "2_secondary@1" },
		{ command: this.bookmarkCommands.openHelp.command, group: "2_secondary@2" },
		{ command: this.bookmarkCommands.openSettings.command, group: "2_secondary@3" }
	]

	static exportSubmenu_items = [
		{ command: this.bookmarkCommands.exportToMarkdown.command, group: "1_formats@1" },
		{ command: this.bookmarkCommands.exportToHtml.command, group: "1_formats@2" },
		{ command: this.bookmarkCommands.exportToCsv.command, group: "1_formats@3" },
		{ command: this.bookmarkCommands.exportToText.command, group: "1_formats@4" },
		{ command: this.bookmarkCommands.exportSourceFiles.command, group: "1_formats@5" },
		{ submenu: this.batchExportSubmenuId, group: "2_batch@1" },
	]

	static batchExportSubmenu_items = [
		{ command: this.bookmarkCommands.batchExportToMarkdown.command, group: "1_items@1" },
		{ command: this.bookmarkCommands.batchExportToHtml.command, group: "1_items@2" },
		{ command: this.bookmarkCommands.batchExportToCsv.command, group: "1_items@3" },
		{ command: this.bookmarkCommands.batchExportToText.command, group: "1_items@4" },
		{ command: this.bookmarkCommands.batchExportSourceFiles.command, group: "1_items@5" },
	]

	static aiSubmenu_items = [
		{
			submenu: this.aiGenerateSubmenuId,
			group: "1_items@1",
			when: `${this.varAIAnalysisAvailable} && ${this.varActiveFileAvailable} && (${this.varActiveFileHasBookmark} || ${this.whenAIFolderTarget})`,
		},
		{
			submenu: this.aiGenerateWorkspaceSubmenuId,
			group: "1_items@1",
			when: `${this.varAIAnalysisAvailable} && !${this.varActiveFileAvailable} && ${this.whenBookmarkedFolderTarget}`,
		},
		{
			command: this.bookmarkCommands.aiGenerateSkip.command,
			group: "1_items@1",
			when: `${this.varAIAnalysisAvailable} && ${this.varActiveFileAvailable} && !${this.varActiveFileHasBookmark} && !${this.whenAIFolderTarget}`,
		},
		{
			command: this.bookmarkCommands.aiGenerateSkipFolderDirect.command,
			group: "1_items@1",
			when: `${this.varAIAnalysisAvailable} && !${this.varActiveFileAvailable} && ${this.whenWorkspaceFolderOpen} && ${this.varCurrentFolderHasUnbookmarkedScript} && !${this.varCurrentFolderHasBookmarkedScript}`,
		},
		{
			submenu: this.aiOptimizeSubmenuId,
			group: "1_items@2",
			when: `${this.varAIAnalysisAvailable} && ((${this.whenActiveBookmarkedFile} && ${this.whenBookmarkedFolderTarget}) || (${this.whenActiveBookmarkedFile} && codebookmark.hasSelection) || (${this.whenBookmarkedFolderTarget} && codebookmark.hasSelection))`,
		},
		{
			command: this.bookmarkCommands.aiOptimizeDirect.command,
			group: "1_items@2",
			when: `${this.varAIAnalysisAvailable} && ${this.whenActiveBookmarkedFile} && !codebookmark.hasSelection && !${this.whenBookmarkedFolderTarget}`,
		},
		{
			command: this.bookmarkCommands.aiOptimizeFolderDirect.command,
			group: "1_items@2",
			when: `${this.varAIAnalysisAvailable} && ${this.whenBookmarkedFolderTarget} && !${this.whenActiveBookmarkedFile} && !codebookmark.hasSelection`,
		},
		{
			command: this.bookmarkCommands.aiOptimizeSelectedDirect.command,
			group: "1_items@2",
			when: `${this.varAIAnalysisAvailable} && ${this.whenWorkspaceFolderOpen} && codebookmark.hasSelection && !${this.whenActiveBookmarkedFile} && !${this.whenBookmarkedFolderTarget}`,
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
			this.bookmarkCommands.batchExportSourceFiles,
		].map(command => ({ command: command.command, when: 'false' })),
	]

	static view_item_context = [
		this.bookmarkCommands.pinView,
		this.bookmarkCommands.unpinView,
		{
			"submenu": this.editSubmenuId,
			"when": `${this.viewCodeBookmarkView} && ${this.editableBookmarkOnTree}`,
			"group": "inline@3"
		},
		this.bookmarkCommands.deleteBookmark,
		{
			"command": this.bookmarkCommands.editBookmark_editLabel.command,
			"when": `${this.viewCodeBookmarkView} && ${this.editableBookmarkOnTree}`,
			"group": "1_edit@1"
		},
		{
			"command": this.bookmarkCommands.editBookmark_changeIcon.command,
			"when": `${this.viewCodeBookmarkView} && ${this.editableBookmarkOnTree}`,
			"group": "1_edit@2"
		},
		{
			"command": this.bookmarkCommands.editBookmark_restoreDefaultIcon.command,
			"when": `${this.viewCodeBookmarkView} && ${this.restoreDefaultIconOnTree}`,
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
				"codebookmark.AI.endpoint": {
					"order": 5,
					"type": "string",
					"default": "",
					"description": "AI 接口地址；远程服务应使用 HTTPS"
				},
				"codebookmark.AI.apiKey": {
					"order": 6,
					"type": "string",
					"default": "",
					"description": "AI 接口密钥（API Key）"
				},
				"codebookmark.AI.model": {
					"order": 7,
					"type": "string",
					"default": "",
					"markdownDescription": "AI 模型名称。配置 API Key 后可 [验证 AI 连接](command:codebookmark.ai.testConnection)"
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
					"default": DEFAULT_AI_GENERATION_PROMPT,
					"description": "AI 自动提取书签的系统提示词。"
				},
				"codebookmark.AI.optimizePrompt": {
					"order": 11,
					"type": "string",
					"editPresentation": "multilineText",
					"default": DEFAULT_AI_OPTIMIZATION_PROMPT,
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
