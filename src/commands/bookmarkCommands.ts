
import * as vscode from 'vscode'
import { CodeBookmarksViewProvider } from '../providers/CodeBookmarkViewProvider'
import { Commands } from '../util/constants/Commands'
import { Bookmark } from '../models/Bookmark'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { AIService } from '../util/AIService'


export function bookmarkCommands(context: vscode.ExtensionContext,
	provider: CodeBookmarksViewProvider,
) {

	const toggleBookmark = vscode.commands.registerCommand(Commands.bookmarkCommands.toggleBookmark.command,
		() => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				return
			}
			provider.toggleBookmark(editor)
		})

	const forceAddBookmark = vscode.commands.registerCommand(Commands.bookmarkCommands.forceAddBookmark.command,
		() => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				return
			}
			provider.forceAddBookmark(editor)
		})

	const forceDeleteBookmark = vscode.commands.registerCommand(Commands.bookmarkCommands.forceDeleteBookmark.command,
		() => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			const editor = vscode.window.activeTextEditor
			if (!editor) {
				return
			}
			provider.forceDeleteBookmark(editor)
		})


	const deleteButton = vscode.commands.registerCommand(Commands.bookmarkCommands.deleteBookmark.command,
		(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.onDeleteBookmark(bookmark, selectedBookmarks)
		})

	const editBookmark_editLabel = vscode.commands.registerCommand(Commands.bookmarkCommands.editBookmark_editLabel.command,
		(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.editBookmark_editLabel(bookmark, selectedBookmarks)
		})

	const editBookmark_updatePosOnly = vscode.commands.registerCommand(Commands.bookmarkCommands.editBookmark_updatePosOnly.command,
		(bookmark: Bookmark) => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.editBookmark_updatePosOnly(bookmark)
		})

	const editBookmark_updatePosAndRename = vscode.commands.registerCommand(Commands.bookmarkCommands.editBookmark_updatePosAndRename.command,
		(bookmark: Bookmark) => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.editBookmark_updatePosAndRename(bookmark)
		})

	const editBookmark_changeIcon = vscode.commands.registerCommand(Commands.bookmarkCommands.editBookmark_changeIcon.command,
		(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.editBookmark_changeIcon(bookmark, selectedBookmarks)
		})

	const editBookmark_restoreDefaultIcon = vscode.commands.registerCommand(Commands.bookmarkCommands.editBookmark_restoreDefaultIcon.command,
		(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.editBookmark_restoreDefaultIcon(bookmark, selectedBookmarks)
		})

	const renameBookmarkCommand = vscode.commands.registerCommand(Commands.bookmarkCommands.renameBookmark.command,
		(bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.onRenameBookmark(bookmark, selectedBookmarks)
		})

	const pinViewButton = vscode.commands.registerCommand(Commands.bookmarkCommands.pinView.command,
		(bookmark: Bookmark) => {
			provider.onClickPinView(bookmark)
		})

	const unpinViewButton = vscode.commands.registerCommand('codebookmark.unpinView',
		(bookmark: Bookmark) => {
			provider.onClickPinView(bookmark)
		})

	const moveUpLevel = vscode.commands.registerCommand('codebookmark.moveUpLevel',
		(bookmark: Bookmark) => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.onMoveUpLevel(bookmark)
		})

	const openSettings = vscode.commands.registerCommand('codebookmark.openSettings',
		() => {
			vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark')
		})

	const searchInFile = vscode.commands.registerCommand('codebookmark.bookmark.searchInFile',
		() => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.onSearchInFile()
		})

	const sortMode = vscode.commands.registerCommand('codebookmark.bookmark.sort',
		() => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.onSort()
		})

	const actions = ['', '.drag', '.add', '.delete', '.sync', '.rename', '.icon', '.move', '.status', '.ai', '.ai-optimize'];
	
	const undoCommands = actions.map(action => 
		vscode.commands.registerCommand(`codebookmark.undo${action}`, () => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.undo();
		})
	);

	const redoCommands = actions.map(action => 
		vscode.commands.registerCommand(`codebookmark.redo${action}`, () => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.redo();
		})
	);

	const checkAIPrerequisites = (): vscode.TextEditor | undefined => {
		if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return undefined;
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('未打开任何文件，无法进行 AI 分析。');
			return undefined;
		}
		if (!ExtensionConfig.aiApiKey || !ExtensionConfig.aiEndpoint || !ExtensionConfig.aiModel) {
			vscode.window.showErrorMessage('尚未完整配置 AI 相关信息 （Endpoint， Model， API Key）。请先在设置中填写。');
			vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.ai');
			return undefined;
		}
		return editor;
	};

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiGenerateAppend.command,
		async () => {
			const editor = checkAIPrerequisites();
			if (editor) await provider.generateBookmarksWithAI(editor, 'append');
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiGenerateOverwrite.command,
		async () => {
			const editor = checkAIPrerequisites();
			if (editor) await provider.generateBookmarksWithAI(editor, 'overwrite');
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiGenerateSkip.command,
		async () => {
			const editor = checkAIPrerequisites();
			if (editor) await provider.generateBookmarksWithAI(editor, 'skip_existing');
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiGenerateAppendFolder.command,
		async () => {
			const editor = checkAIPrerequisites();
			if (editor) await provider.generateBookmarksForFolderWithAI(editor, 'append');
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiGenerateOverwriteFolder.command,
		async () => {
			const editor = checkAIPrerequisites();
			if (editor) await provider.generateBookmarksForFolderWithAI(editor, 'overwrite');
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiGenerateSkipFolder.command,
		async () => {
			const editor = checkAIPrerequisites();
			if (editor) await provider.generateBookmarksForFolderWithAI(editor, 'skip_existing');
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiOptimize.command,
		async () => {
			const editor = checkAIPrerequisites();
			if (editor) await provider.optimizeBookmarksWithAI(editor);
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiOptimizeFolder.command,
		async () => {
			const editor = checkAIPrerequisites();
			if (editor) await provider.optimizeBookmarksForFolderWithAI(editor);
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiOptimizeSelected.command,
		async () => {
			await provider.optimizeSelectedBookmarksWithAI();
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiOptimizeContextItem.command,
		async (bookmark?: Bookmark, selectedBookmarks?: Bookmark[]) => {
			await provider.optimizeSelectedBookmarksWithAI(bookmark, selectedBookmarks);
		}));

	context.subscriptions.push(vscode.commands.registerCommand(Commands.bookmarkCommands.aiTestConnection.command,
		async () => {
			if (!ExtensionConfig.aiApiKey || !ExtensionConfig.aiEndpoint || !ExtensionConfig.aiModel) {
				vscode.window.showErrorMessage('尚未完整配置 AI 相关信息 （Endpoint， Model， API Key）。请先在设置中填写。');
				vscode.commands.executeCommand('workbench.action.openSettings', 'codebookmark.ai');
				return;
			}
			vscode.window.showInformationMessage('正在测试 AI 连接，请稍候。。。');
			try {
				await AIService.testConnection();
				vscode.window.showInformationMessage('AI 连接测试成功！');
			} catch (err: any) {
				vscode.window.showErrorMessage(`AI 连接测试失败： ${err.message}`);
			}
		}));

	const toggleExpandCollapse = vscode.commands.registerCommand('codebookmark.toggleExpandCollapse',
		() => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.toggleExpandCollapse();
		})

	const collapseToLevel = vscode.commands.registerCommand('codebookmark.collapseToLevel',
		() => {
			if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
			provider.toggleExpandCollapse();
		})

	const openHelp = vscode.commands.registerCommand('codebookmark.openHelp', () => {
		const uri = vscode.Uri.joinPath(context.extensionUri, 'README.md');
		vscode.commands.executeCommand('markdown.showPreview', uri);
	})

	const clearInvalid = vscode.commands.registerCommand('codebookmark.clearInvalidBookmarks', () => {
		if (!ExtensionConfig.ensureGlobalStoragePathConfigured()) return;
		provider.clearInvalidBookmarks();
	});

	context.subscriptions.push(
		toggleBookmark,
		forceAddBookmark,
		forceDeleteBookmark,
		openSettings,
		openHelp,

		pinViewButton,
		unpinViewButton,
		editBookmark_editLabel,
		editBookmark_updatePosOnly,
		editBookmark_updatePosAndRename,
		editBookmark_changeIcon,
		editBookmark_restoreDefaultIcon,
		renameBookmarkCommand,
		deleteButton,
		moveUpLevel,
		searchInFile,
		sortMode,
		toggleExpandCollapse,
		collapseToLevel,
		clearInvalid,
		...undoCommands,
		...redoCommands,
	)
}
