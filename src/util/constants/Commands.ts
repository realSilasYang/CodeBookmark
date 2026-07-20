import { ContextBookmark } from '../ContextValue'
import { Icons } from './Icons'

class When {
	static readonly editorTextFocus = 'editorTextFocus'
}

export class Commands {
	static readonly nameExtension = 'codebookmark'
	static readonly nameBookmark = '.bookmark'

	static readonly editorContextSubmenu = 'codebookmark.editor.context'

	static readonly varCodeBookmarkAsList = 'bookmarks.var.bookmark.viewAsList'
	static readonly varHasBookmark = 'bookmarks.var.bookmark.hasBookmark'
	static readonly varHasWatcher = 'bookmarks.var.bookmark.hasWatcher'
	static readonly varCanUndo = 'bookmarks.var.bookmark.canUndo'
	static readonly varCanRedo = 'bookmarks.var.bookmark.canRedo'
	static readonly varStorageModeJSON = 'bookmarks.var.storageMode.json'
	static readonly varStorageModeWorkspace = 'bookmarks.var.storageMode.workspace'
	static readonly varBookmarkLoaded = 'bookmarks.var.bookmark.loaded'
	static readonly varIsExpanded = 'codebookmark.var.isExpanded'

	static get watcherTreeViewName() { return Commands.nameExtension + 'WatcherTree' }
	static get codeBookmarkViewName() { return Commands.nameExtension + 'TreeView' }
	static get helpAndFeedbackTreeViewName() { return Commands.nameExtension + 'HelpAndFeedback' }

	static get openBookmark() { return Commands.nameExtension + '.openBookmark' }

	static viewCodeBookmarkView = `(view == ${this.codeBookmarkViewName})`
	static viewWatcherTreeView = `(view == ${this.watcherTreeViewName})`
	static bookmarkOnTree = `(viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.Watcher} || viewItem == ${ContextBookmark.BookmarkFolder} || viewItem == ${ContextBookmark.BookmarkInvalid}) `
	static bookmarkOnAll = `(viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.Watcher}) `
	static bookmarkOrWatcherView = `(${this.viewCodeBookmarkView} || ${this.viewWatcherTreeView})`

	static indexStatusBarButton = {
		undo: 1,
		redo: 2,
		aiGenerate: 3,
		searchInFile: 4,
		toggleExpand: 5,
		sort: 6,
		openHelp: 7,
		settings: 8
	}

	static bookmarkCommands = {
		// keyboard shortcut
		toggleBookmark: {
			'command': Commands.nameExtension + '.toggleBookmark',
			'title': '添加/删除书签',
			'key': 'ctrl+b',
			"category": "Code Bookmarks",
			'when': When.editorTextFocus,
		},
		forceAddBookmark: {
			'command': Commands.nameExtension + '.forceAddBookmark',
			'title': '强制添加书签',
			'key': 'ctrl+alt+shift+b',
			"category": "Code Bookmarks",
			'when': When.editorTextFocus,
		},
		forceDeleteBookmark: {
			'command': Commands.nameExtension + '.forceDeleteBookmark',
			'title': '强制删除书签',
			'key': 'ctrl+alt+shift+d',
			"category": "Code Bookmarks",
			'when': When.editorTextFocus,
		},

		// Button on item
		deleteBookmark: {
			'command': Commands.nameExtension + '.deleteBookmark',
			'title': '删除',
			'icon': Icons.delete,
			'when': `${this.bookmarkOrWatcherView} && (${this.bookmarkOnTree} || viewItem == ${ContextBookmark.BookmarkPinned})`,
			'group': 'inline@4'
		},
		editBookmark: {
			'command': Commands.nameExtension + '.editBookmark',
			'title': '编辑标签',
			'icon': Icons.edit
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
			'when': `listFocus && (focusedView == '${Commands.nameExtension}TreeView' || focusedView == '${Commands.nameExtension}WatcherTree')`,
			'category': "Code Bookmarks"
		},
		pinView: {
			'command': Commands.nameExtension + '.pinView',
			'title': '设为新书签上级节点',
			'icon': '$(folder-opened)',
			'when': `${this.bookmarkOrWatcherView} && ${this.bookmarkOnAll}`,
			'group': 'inline@2'
		},
		unpinView: {
			'command': Commands.nameExtension + '.unpinView',
			'title': '取消新书签上级节点',
			'icon': '$(folder)',
			'when': `${this.bookmarkOrWatcherView} && viewItem == ${ContextBookmark.BookmarkPinned}`,
			'group': 'inline@2'
		},

		// Top Bar Buttons
		undo: {
			'command': Commands.nameExtension + '.undo',
			'title': '撤销',
			'icon': '$(discard)',
			'when': `${this.viewCodeBookmarkView}`,
			'enablement': `${this.varCanUndo}`,
			'category': "Code Bookmarks",
			'group': `navigation@${this.indexStatusBarButton.undo}`
		},
		redo: {
			'command': Commands.nameExtension + '.redo',
			'title': '恢复',
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
			"group": `navigation@${this.indexStatusBarButton.sort}`,
		},
		openSettings: {
			'command': Commands.nameExtension + '.openSettings',
			'title': '$(settings) 打开代码书签设置',
			'icon': '$(settings)',
			'when': `${this.viewCodeBookmarkView}`,
			"category": "Code Bookmarks",
			"group": `navigation@${this.indexStatusBarButton.settings}`
		},
		openHelp: {
			'command': Commands.nameExtension + '.openHelp',
			'title': '$(info) 使用说明',
			'icon': '$(info)',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "Code Bookmarks",
			"group": `navigation@8`
		},
		aiGenerateAppend: {
			'command': Commands.nameExtension + '.ai.generateAppend',
			'title': '$(add) 追加',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "Code Bookmarks"
		},
		aiGenerateOverwrite: {
			'command': Commands.nameExtension + '.ai.generateOverwrite',
			'title': '$(replace) 替换',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "Code Bookmarks"
		},
		aiGenerateSkip: {
			'command': Commands.nameExtension + '.ai.generateSkip',
			'title': '$(diff-added) 生成',
			'when': `${Commands.viewCodeBookmarkView} && !codebookmark.activeFileHasBookmark`,
			"category": "Code Bookmarks"
		},
		aiOptimize: {
			'command': Commands.nameExtension + '.ai.optimize',
			'title': '$(hubot) 单文件',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "Code Bookmarks"
		},
		aiOptimizeSelected: {
			'command': Commands.nameExtension + '.ai.optimizeSelected',
			'title': '$(hubot) 选中项',
			'when': `((view == ${Commands.viewCodeBookmarkView}) || (view == ${Commands.viewWatcherTreeView})) && ((viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.Watcher} || viewItem == ${ContextBookmark.BookmarkFolder} || viewItem == ${ContextBookmark.BookmarkInvalid})  || viewItem == ${ContextBookmark.BookmarkPinned})`,
			"category": "Code Bookmarks"
		},
		aiGenerateAppendFolder: {
			'command': Commands.nameExtension + '.ai.generateAppendFolder',
			'title': '$(add) 追加',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "Code Bookmarks"
		},
		aiGenerateOverwriteFolder: {
			'command': Commands.nameExtension + '.ai.generateOverwriteFolder',
			'title': '$(replace) 替换',
			'when': `${Commands.viewCodeBookmarkView}`,
			"category": "Code Bookmarks"
		},
		aiGenerateSkipFolder: {
			'command': Commands.nameExtension + '.ai.generateSkipFolder',
			'title': '$(diff-added) 生成',
			'when': `${Commands.viewCodeBookmarkView} && !codebookmark.activeFileHasBookmark`,
			"category": "Code Bookmarks"
		},
		aiOptimizeFolder: {
			'command': Commands.nameExtension + '.ai.optimizeFolder',
			'title': '$(hubot) 文件夹',
			'when': `${Commands.viewCodeBookmarkView}`
		},
		aiOptimizeContextItem: {
			'command': Commands.nameExtension + '.ai.optimizeContextItem',
			'title': '$(hubot) AI 优化书签标签',
			'when': `${Commands.bookmarkOrWatcherView} && (${Commands.bookmarkOnTree} || viewItem == ${ContextBookmark.BookmarkPinned})`,
			"category": "Code Bookmarks"
		},
		aiTestConnection: {
			'command': Commands.nameExtension + '.ai.testConnection',
			'title': 'Test AI Connection',
			"category": "Code Bookmarks",
		},
		exportToMarkdown: {
			'command': Commands.nameExtension + '.exportToMarkdown',
			'title': '$(export) 导出书签为 Markdown 报表',
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
	static readonly aiSubmenuId = 'codebookmark.aiSubmenu'
	static readonly aiGenerateSubmenuId = 'codebookmark.aiGenerateSubmenu'
	static readonly aiGenerateFileSubmenuId = 'codebookmark.aiGenerateFileSubmenu'
	static readonly aiGenerateFolderSubmenuId = 'codebookmark.aiGenerateFolderSubmenu'
	static readonly aiOptimizeSubmenuId = 'codebookmark.aiOptimizeSubmenu'

	static submenus = [
		{
			"id": this.editorContextSubmenu,
			"label": "书签菜单"
		},
		{
			"id": this.editSubmenuId,
			"label": "编辑书签",
			"icon": Icons.edit
		},
		{
			"id": this.moreSubmenuId,
			"label": "更多",
			"icon": "$(three-bars)"
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
			"id": this.aiGenerateFileSubmenuId,
			"label": "当前文件"
		},
		{
			"id": this.aiGenerateFolderSubmenuId,
			"label": "文件夹及子目录"
		},
		{
			"id": this.aiOptimizeSubmenuId,
			"label": "优化标签"
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
		{ command: this.bookmarkCommands.exportToMarkdown.command, group: "1_primary@2" },
		{ command: this.bookmarkCommands.openHelp.command, group: "2_secondary@1" },
		{ command: this.bookmarkCommands.openSettings.command, group: "2_secondary@2" }
	]

	static aiSubmenu_items = [
		{ submenu: this.aiGenerateSubmenuId, group: "1_items@1" },
		{ submenu: this.aiOptimizeSubmenuId, group: "1_items@2" }
	]

	static aiGenerateSubmenu_items = [
		{ submenu: this.aiGenerateFileSubmenuId, group: "1_items@1" },
		{ submenu: this.aiGenerateFolderSubmenuId, group: "1_items@2" }
	]

	static aiGenerateFileSubmenu_items = [
		{ command: this.bookmarkCommands.aiGenerateSkip.command, group: "1_items@1" },
		{ command: this.bookmarkCommands.aiGenerateAppend.command, group: "1_items@2" },
		{ command: this.bookmarkCommands.aiGenerateOverwrite.command, group: "1_items@3" }
	]

	static aiGenerateFolderSubmenu_items = [
		{ command: this.bookmarkCommands.aiGenerateSkipFolder.command, group: "1_items@1" },
		{ command: this.bookmarkCommands.aiGenerateAppendFolder.command, group: "1_items@2" },
		{ command: this.bookmarkCommands.aiGenerateOverwriteFolder.command, group: "1_items@3" }
	]

	static aiOptimizeSubmenu_items = [
		{ command: this.bookmarkCommands.aiOptimizeSelected.command, group: "4_optimize@1", when: "codebookmark.hasSelection" },
		{ command: this.bookmarkCommands.aiOptimize.command, group: "4_optimize@2" },
		{ command: this.bookmarkCommands.aiOptimizeFolder.command, group: "4_optimize@3" }
	]

	static commandPalett = [
		{ command: this.bookmarkCommands.toggleBookmark.command },
		{ command: this.bookmarkCommands.forceAddBookmark.command },
		{ command: this.bookmarkCommands.forceDeleteBookmark.command },
		{ command: this.bookmarkCommands.aiTestConnection.command }
	]

	static view_title = [
		this.bookmarkCommands.undo,
		this.bookmarkCommands.redo,
		{
			"submenu": this.aiSubmenuId,
			"when": `${this.viewCodeBookmarkView}`,
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

	static view_item_context = [
		this.bookmarkCommands.pinView,
		this.bookmarkCommands.unpinView,
		{
			"submenu": this.editSubmenuId,
			"when": `${this.bookmarkOrWatcherView} && (viewItem == ${ContextBookmark.Bookmark} || viewItem == ${ContextBookmark.Watcher} || viewItem == ${ContextBookmark.BookmarkFolder} || viewItem == ${ContextBookmark.BookmarkPinned} || viewItem == ${ContextBookmark.BookmarkInvalid})`,
			"group": "inline@3"
		},
		this.bookmarkCommands.deleteBookmark,
		{
			"command": this.bookmarkCommands.editBookmark_editLabel.command,
			"when": `${this.bookmarkOrWatcherView} && (${this.bookmarkOnTree} || viewItem == ${ContextBookmark.BookmarkPinned})`,
			"group": "1_edit@1"
		},
		{
			"command": this.bookmarkCommands.editBookmark_changeIcon.command,
			"when": `${this.bookmarkOrWatcherView} && (${this.bookmarkOnTree} || viewItem == ${ContextBookmark.BookmarkPinned})`,
			"group": "1_edit@2"
		},
		{
			"command": this.bookmarkCommands.editBookmark_restoreDefaultIcon.command,
			"when": `${this.bookmarkOrWatcherView} && (${this.bookmarkOnTree} || viewItem == ${ContextBookmark.BookmarkPinned})`,
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
			"title": "Code Bookmarks Settings",
			"properties": {
				"codebookmark.globalStoragePath": {
					"order": 1,
					"type": "string",
					"default": "",
					"description": "全局书签配置存放的绝对路径文件夹（必填项，禁止留空）"
				},
				"codebookmark.ai.endpoint": {
					"order": 2,
					"type": "string",
					"default": "",
					"description": "AI 接口地址"
				},
				"codebookmark.ai.apiKey": {
					"order": 3,
					"type": "string",
					"default": "",
					"description": "AI 接口密钥 (API Key)"
				},
				"codebookmark.ai.model": {
					"order": 4,
					"type": "string",
					"default": "",
					"markdownDescription": "AI 模型名称。配置完成上方要素后，[点击这里验证 AI 连接](command:codebookmark.ai.testConnection)"
				},
				"codebookmark.defaultExpandLevel": {
					"order": 5,
					"type": "integer",
					"default": 3,
					"minimum": 0,
					"description": "展开/折叠按钮的默认展开级别。设为 3 表示展开时显示前三级书签；设为 0 表示展开全部层级。"
				},
				"codebookmark.ai.prompt": {
					"order": 6,
					"type": "string",
					"editPresentation": "multilineText",
					"default": "你是一个专业的代码审查与提炼助手。\n请主要【根据代码中的注释内容】来组织和生成书签。注意确保行号 (line) 必须准确地指向对应注释或相关代码所在的真实行号（0索引）。\n⚠️极其重要：你的计算常常会数错行号，因此你的 `content` 字段**必须**包含原封不动的、完整的一行真实代码或注释文本（原样摘录，不可修改删减）。插件底层会通过全文检索该 `content` 来进行二次纠错定位！\n关于层级嵌套 (subs)：请根据代码的实际逻辑结构决定书签是否并列或嵌套。**绝不要无脑把所有书签都嵌套在第一个书签之下**，应当有多个合理的平行的根级书签！\n输出必须是严格的JSON格式，包含一个 bookmarks 数组，必须完全遵循插件原生书签配置结构，不要输出额外解释，不要用Markdown包裹。\n字段说明：\n- id: 书签唯一ID，随机短字符串(如7位字母数字)\n- label: 书签的显示标签，提取或精简注释内容\n- path: 文件相对路径，请直接使用提示中提供的【当前文件路径】\n- line: 书签所在行号(0索引，即真实行号减1)\n- opened: 展开状态(如果该书签包含 subs 子节点，请务必设为 2 表示默认展开；没有子节点设为 0)\n- content: 必须是对应行的真实文本(含注释符)\n- subs: 子书签数组，表示逻辑上的从属关系，要合理分层\n- params: 位置参数，格式为 \"开始行,开始列,结束行,结束列\"\n示例：\n{\n  \"bookmarks\": [\n    {\n      \"id\": \"vp8kipq\",\n      \"label\": \"系统初始化配置\",\n      \"path\": \"example.ts\",\n      \"line\": 14,\n      \"opened\": 2,\n      \"content\": \"// 1. 系统初始化配置\",\n      \"subs\": [\n        {\n          \"id\": \"vp8kiXz\",\n          \"label\": \"加载环境变量\",\n          \"path\": \"example.ts\",\n          \"line\": 16,\n          \"opened\": 0,\n          \"content\": \"// 读取并解析.env\",\n          \"subs\": [],\n          \"params\": \"16,0,16,10\"\n        }\n      ],\n      \"params\": \"14,0,14,14\"\n    },\n    {\n      \"id\": \"ab12cde\",\n      \"label\": \"网络请求模块\",\n      \"path\": \"example.ts\",\n      \"line\": 30,\n      \"opened\": 0,\n      \"content\": \"// ================= 网络请求模块 =================\",\n      \"subs\": [],\n      \"params\": \"30,0,30,50\"\n    }\n  ]\n}",
					"description": "AI 自动生成书签时的提示词（Prompt）"
				},
				"codebookmark.ai.optimizePrompt": {
					"order": 7,
					"type": "string",
					"editPresentation": "multilineText",
					"default": "你是一个专业的高级工程师。请根据提供的文件源码上下文，优化以下提供的现有书签的标签（label）。\n要求：\n1. 深刻理解源码逻辑，返回优化后的标签。\n2. 标签必须极其简练（尽量控制在15个字以内），直击核心逻辑。\n3. 不要包含特殊符号。\n4. 绝对不能修改或提议修改书签的其他任何配置部分。\n5. 返回格式必须是合法的纯 JSON 数组，对象字段仅包含 `id` 和 `new_label`，不包含任何 Markdown 标记。\n示例：\n[\n  { \"id\": \"vp8kipq\", \"new_label\": \"系统初始化\" }\n]",
					"description": "AI 优化书签标签时的提示词（Prompt）"
				},
				"codebookmark.autoSpace": {
					"order": 8,
					"type": "boolean",
					"default": true,
					"description": "是否在书签标签的中英文/数字之间自动插入空格，优化排版显示。"
				},
				"codebookmark.inlineLabel": {
					"order": 9,
					"type": "boolean",
					"default": true,
					"description": "在光标所在行的代码末尾显示书签标签的幽灵文本（类似 GitLens 的行内注释效果）。"
				}
			}
		}
	]

	static keybindings = [
		{
			"command": Commands.nameExtension + ".deleteBookmark",
			"key": "delete",
			"when": `listFocus && (focusedView == '${Commands.nameExtension}TreeView' || focusedView == '${Commands.nameExtension}WatcherTree')`
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
