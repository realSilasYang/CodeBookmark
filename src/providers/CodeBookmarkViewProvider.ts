import * as vscode from 'vscode'
import { Commands } from '../util/constants/Commands'
import { fileUtils } from '../util/FileUtils'
import { Helper } from '../util/Helper'
import { logger } from '../util/Logger'

import { IconPickerWebview } from '../util/quick_pick_icon/IconPickerWebview'
import { Bookmark, CursorIndex } from '../models/Bookmark'
import { LinePath } from '../models/LinePath'
import { BookmarkSet } from '../models/BookmarkSet'
import { bookmarkRepository } from '../repository/BookmarkRepository'
import { SortModeBookmark } from '../models/ViewMode'
import fs = require('fs')
import * as path from 'path'
import { ContextBookmark } from '../util/ContextValue'
import { ExtensionConfig } from '../config/ExtensionConfig'
import { undoManager } from './UndoManager'
import { AIService } from '../util/AIService'

export class CodeBookmarksViewProvider implements vscode.TreeDataProvider<Bookmark>, vscode.TreeDragAndDropController<Bookmark> {
	private _onDidChangeTreeData: vscode.EventEmitter<Bookmark | undefined | null | void> = new vscode.EventEmitter<Bookmark | undefined | null | void>()
	readonly onDidChangeTreeData: vscode.Event<Bookmark | undefined | null | void> = this._onDidChangeTreeData.event

	dropMimeTypes = ['application/vnd.code.tree.codebookmarkCodeBookmark']
	dragMimeTypes = ['text/uri-list']

	private hasBookmark = false

	public codeBookmarks = new BookmarkSet()
	private workspaceOrderCache: string[] | null = null;
	private fileNodesCache = new Map<string, Bookmark>();
	private _pathIndex: Map<string, Bookmark[]> | null = null;

	public invalidatePathIndex() {
		this._pathIndex = null;
	}

	public getBookmarksByPath(pathStr: string): Bookmark[] {
		if (this._pathIndex === null) {
			this._pathIndex = new Map();
			const buildIndex = (bms: BookmarkSet) => {
				for (const b of bms.values) {
					if (b.path) {
						let arr = this._pathIndex!.get(b.path);
						if (!arr) {
							arr = [];
							this._pathIndex!.set(b.path, arr);
						}
						arr.push(b);
					}
					if (b.subs.size > 0) {
						buildIndex(b.subs);
					}
				}
			};
			buildIndex(this.codeBookmarks);
		}
		return this._pathIndex.get(pathStr) || [];
	}

	private context: vscode.ExtensionContext
	private viewCodeBookmark: vscode.TreeView<Bookmark> | undefined

	private _initPromise: Promise<void>;
	private _resolveInit!: () => void;
	private runningAITasks: Set<string> = new Set();

	public constructor(context: vscode.ExtensionContext) {
		this.context = context

		this._initPromise = new Promise(resolve => {
			this._resolveInit = resolve;
		});

		// Create decoration type for inline ghost text (bookmark label at end of line)
		this._inlineLabelDecorationType = vscode.window.createTextEditorDecorationType({
			after: {
				color: new vscode.ThemeColor('editorCodeLens.foreground'),
				fontStyle: 'italic',
				textDecoration: 'none; opacity: 0.85; margin-left: 2ch; font-size: 90%; font-family: "LXGW WenKai", "霞鹜文楷", sans-serif;'
			}
		});
	}

	public treeView?: vscode.TreeView<Bookmark>;

	// Inline ghost text decoration
	private _inlineLabelDecorationType: vscode.TextEditorDecorationType;
	private _cursorDisposable?: vscode.Disposable;

	async init(treeView: vscode.TreeView<Bookmark>) {
		this.treeView = treeView;
		treeView.onDidChangeSelection((event) => {
			const hasSelection = event.selection && event.selection.length > 0 && event.selection.some(e => e.contextValue === ContextBookmark.Bookmark || e.contextValue === ContextBookmark.BookmarkPinned);
			vscode.commands.executeCommand('setContext', 'codebookmark.hasSelection', hasSelection);
		});

		// Setup cursor change listener for inline ghost text
		this._cursorDisposable = vscode.window.onDidChangeTextEditorSelection(e => {
			this.updateInlineDecoration(e.textEditor);
		});
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				this.updateInlineDecoration(editor);
			}
		});

		await this.initViewEditor()
		this._resolveInit()
	}

	getParent(element: Bookmark): Bookmark | undefined {
		return element.parent
	}

	async getChildren(element?: Bookmark): Promise<Bookmark[]> {
		await this._initPromise;
		if (this.codeBookmarks.size === 0) return []
		
		let items: Bookmark[];
		if (element) {
			if (element.contextValue === ContextBookmark.File) {
				const fileBookmarks = Array.from(this.codeBookmarks.values).filter(b => b.path === element.path);
				for (const child of fileBookmarks) {
					child.parent = element
				}
				items = fileBookmarks;
			} else {
				for (const child of element.subs.values) {
					child.parent = element
				}
				items = Array.from(element.subs.values)
			}
		} else {
			if (fileUtils.isWorkspaceMode()) {
				const paths = new Set<string>();
				for (const child of this.codeBookmarks.values) {
					if (child.path) paths.add(child.path);
				}
				
				const folder = fileUtils.getGlobalBookmarkFolder(this.context, true);
				if (this.workspaceOrderCache === null) {
					this.workspaceOrderCache = [];
					if (folder) {
						const orderFile = path.join(folder, '_workspace_order.json');
						try {
							const data = await fs.promises.readFile(orderFile, 'utf8');
							this.workspaceOrderCache = JSON.parse(data) || [];
						} catch {
							this.workspaceOrderCache = [];
						}
					}
				}

				const savedOrder = this.workspaceOrderCache || [];
				const orderedPaths = savedOrder.filter(p => paths.has(p));
				const orderedSet = new Set(orderedPaths);
				let hasChanges = false;
				for (const p of paths) {
					if (!orderedSet.has(p)) {
						orderedPaths.push(p);
						orderedSet.add(p);
						hasChanges = true;
					}
				}

				if (hasChanges && folder) {
					this.workspaceOrderCache = orderedPaths;
					const orderFile = path.join(folder, '_workspace_order.json');
					// Write asynchronously to avoid blocking the UI thread
					fs.promises.writeFile(orderFile, JSON.stringify(orderedPaths)).catch(e => {
						logger.error(`Failed to write workspace order: ${e}`);
					});
				}

				items = [];
				for (const p of orderedPaths) {
					let fileNode = this.fileNodesCache.get(p);
					if (!fileNode) {
						fileNode = new Bookmark({
							Id: `file_${p}`,
							label: p,
							path: p,
							contextValue: ContextBookmark.File,
							isOpened: true, // Expanded
						});
						fileNode.resourceUri = vscode.Uri.file(fileUtils.relativeToAbsolute(p));
						this.fileNodesCache.set(p, fileNode);
					}
					items.push(fileNode);
				}
			} else {
				for (const child of this.codeBookmarks.values) {
					child.parent = undefined
				}
				items = this.codeBookmarks.values
			}
		}

		if (SortModeBookmark.mode !== SortModeBookmark.Custom) {
			items = [...items].sort((a, b) => {
				switch (SortModeBookmark.mode) {
					case SortModeBookmark.TimeAsc: return a.Id.localeCompare(b.Id);
					case SortModeBookmark.TimeDesc: return b.Id.localeCompare(a.Id);
					case SortModeBookmark.LineAsc: {
						const pathCmp = a.path.localeCompare(b.path);
						if (pathCmp !== 0) return pathCmp;
						return (a.start?.line || 0) - (b.start?.line || 0);
					}
					case SortModeBookmark.LineDesc: {
						const pathCmp = b.path.localeCompare(a.path);
						if (pathCmp !== 0) return pathCmp;
						return (b.start?.line || 0) - (a.start?.line || 0);
					}
					default: return 0;
				}
			});
		}

		return items;
	}

	getTreeItem(element: Bookmark): vscode.TreeItem {
		if (element.contextValue === ContextBookmark.None) {
			return element
		}
		if (element.resourceUri === undefined && element.path && (element.contextValue === ContextBookmark.File || element.contextValue === ContextBookmark.Folder)) {
			// Ensure resourceUri is lazily initialized for file nodes to get VSCode native decorations (like file icons and error badges)
			element.resourceUri = vscode.Uri.file(fileUtils.relativeToAbsolute(element.path));
		}
		element.refreshDisplayProps();
		return element
	}

	// Drag-and-Drop
	handleDrag(source: Bookmark[], treeDataTransfer: vscode.DataTransfer): void {
		for (const i of source) {
			if (i.contextValue === ContextBookmark.None) {
				return
			}
			if (i.isBookmarkInvalid) {
				logger.showWarningMessage('请编辑失效的书签')
				return
			}
		}

		treeDataTransfer.set('application/vnd.code.tree.bookmark', new vscode.DataTransferItem(source))
	}

	async handleDrop(target: Bookmark | undefined, treeDataTransfer: vscode.DataTransfer, _token: vscode.CancellationToken): Promise<void> {
		this.onHandleDrop(target, treeDataTransfer)

	}

	async onHandleDrop(target: Bookmark | undefined, treeDataTransfer: vscode.DataTransfer, extCall: boolean = false) {
		undoManager.saveState(this.codeBookmarks, 'drag');
		if (SortModeBookmark.mode !== SortModeBookmark.Custom) {
			SortModeBookmark.mode = SortModeBookmark.Custom;
			vscode.window.showInformationMessage('检测到拖拽操作，已自动切换回“自定义排序”模式。');
		}

		const transferItem = treeDataTransfer.get('application/vnd.code.tree.bookmark')
		if (!transferItem) {
			return
		}

		const sourceItems = transferItem.value as Bookmark[];
		const isFileDrag = sourceItems.some(b => b.contextValue === ContextBookmark.File);

		if (isFileDrag) {
			const sourcePaths = sourceItems.filter(b => b.contextValue === ContextBookmark.File).map(b => b.path);
			if (sourcePaths.length === 0) return;

			const folder = fileUtils.getGlobalBookmarkFolder(this.context, true);
			let savedOrder: string[] = this.workspaceOrderCache || [];

			const currentPaths = new Set<string>();
			for (const child of this.codeBookmarks.values) {
				if (child.path) currentPaths.add(child.path);
			}
			const currentPathsArray = Array.from(currentPaths);
			
			savedOrder = savedOrder.filter(p => currentPaths.has(p));
			currentPathsArray.forEach(p => {
				if (!savedOrder.includes(p)) savedOrder.push(p);
			});

			const sourcePath = sourcePaths[0];
			const targetPath = target?.contextValue === ContextBookmark.File ? target.path : undefined;

			savedOrder = savedOrder.filter(p => p !== sourcePath);
			if (targetPath) {
				const targetIdx = savedOrder.indexOf(targetPath);
				if (targetIdx >= 0) {
					savedOrder.splice(targetIdx, 0, sourcePath);
				} else {
					savedOrder.push(sourcePath);
				}
			} else {
				savedOrder.push(sourcePath);
			}

			if (folder) {
				this.workspaceOrderCache = savedOrder;
				const orderFile = path.join(folder, '_workspace_order.json');
				fs.promises.writeFile(orderFile, JSON.stringify(savedOrder)).catch(e => {
					logger.error(`Failed to write workspace drag order: ${e}`);
				});
			}
			this._onDidChangeTreeData.fire();
			return;
		}

		if (target && target.contextValue === ContextBookmark.File) {
			vscode.window.showInformationMessage('暂不支持跨文件移动书签。');
			return;
		}

		const source = new BookmarkSet(transferItem.value)
		for (const bookmark of source) {
			if (bookmark.equals(target)) {
				return
			}
		}
		if (!target) {
			if (this.codeBookmarks.moveGroupToNode(source, undefined)) {
				this.saveBookmarksToFile()
				this.refreshDecoration()
			}
			return;
		}

		if (target.isOpened) {
			if (this.codeBookmarks.moveGroupToNode(source, target)) {
				this.saveBookmarksToFile()
				if (!extCall) this.expandFolderTreeView(target)
				this.refreshDecoration()
			}
		} else {
			if (this.codeBookmarks.changeIndexNode(source, target)) {
				this.saveBookmarksToFile()
				if (!extCall) this.expandFolderTreeView(target)
				this.refreshDecoration()
			}
		}
	}
	private configWatchers: fs.FSWatcher[] = [];

	private setupConfigWatcher() {
		try {
			const globalFolder = fileUtils.getGlobalBookmarkFolder(this.context, false);
			const workspaceFolder = fileUtils.isWorkspaceMode() ? fileUtils.getGlobalBookmarkFolder(this.context, true) : null;

			this.configWatchers.forEach(w => w.close());
			this.configWatchers = [];

			let debounceTimer: NodeJS.Timeout | undefined;

			const watchDir = (dir: string | null) => {
				if (!dir || !fs.existsSync(dir)) return;
				const watcher = fs.watch(dir, (eventType, filename) => {
					if (filename && filename.endsWith('.json')) {
						if (debounceTimer) clearTimeout(debounceTimer)
						debounceTimer = setTimeout(() => {
							if (Date.now() < this.ignoreWatchUntil || this.saveRequests.size > 0) return;
							this.reloadActiveTab(true)
						}, 500)
					}
				});
				this.configWatchers.push(watcher);
			};

			watchDir(globalFolder);
			if (workspaceFolder && workspaceFolder !== globalFolder) {
				watchDir(workspaceFolder);
			}

		} catch (e) {
			logger.error('Failed to setup config watcher: ' + e)
		}
	}

	async initViewEditor() {
		try {
			ExtensionConfig.ensureGlobalStoragePathConfigured()
			this.setupConfigWatcher()
			await this.getBookmarksLocal()
		} catch (error) {
			logger.error(error)
		}
		
		// 严防死守：确保 varHasBookmark 的渲染绝对早于 varBookmarkLoaded，避免“暂无书签”闪烁
		const newHasBookmark = !(this.codeBookmarks.size === 0);
		if (newHasBookmark !== this.hasBookmark) {
			this.hasBookmark = newHasBookmark;
			await vscode.commands.executeCommand('setContext', Commands.varHasBookmark, this.hasBookmark);
		}
		await vscode.commands.executeCommand('setContext', Commands.varBookmarkLoaded, true);

		this.refreshDecoration()
	}

	refreshDecoration() {
		if ((this.codeBookmarks.size === 0) === this.hasBookmark) {
			this.hasBookmark = !(this.codeBookmarks.size === 0)
			vscode.commands.executeCommand('setContext', Commands.varHasBookmark, this.hasBookmark)
		}
		vscode.commands.executeCommand('setContext', Commands.varCanUndo, undoManager.canUndo())
		vscode.commands.executeCommand('setContext', Commands.varCanRedo, undoManager.canRedo())
		vscode.commands.executeCommand('setContext', 'bookmarks.var.bookmark.hasInvalid', this.checkHasInvalidBookmarks(this.codeBookmarks));
		
		this.invalidatePathIndex(); // Clear index whenever tree data changes
		this._onDidChangeTreeData.fire()

		// Refresh inline ghost text for current editor
		const editor = vscode.window.activeTextEditor;
		let activeFileHasBookmark = false;
		if (editor) {
			const path = fileUtils.absoluteToRelative(editor.document.uri.fsPath);
			const bookmarks = this.codeBookmarks.getBookmarksWithPath(new BookmarkSet(), path);
			activeFileHasBookmark = bookmarks.size > 0;
			this.updateInlineDecoration(editor);
		}
		vscode.commands.executeCommand('setContext', 'codebookmark.activeFileHasBookmark', activeFileHasBookmark);
	}

	/**
	 * Update inline ghost text decoration: show bookmark label at end of cursor line.
	 * Only renders on the line where the cursor currently sits.
	 */
	public updateInlineDecoration(editor: vscode.TextEditor) {
		if (!this._inlineLabelDecorationType) return;

		if (!ExtensionConfig.inlineLabel) {
			editor.setDecorations(this._inlineLabelDecorationType, []);
			return;
		}

		const cursorLine = editor.selection.active.line;
		const rePath = fileUtils.absoluteToRelative(editor.document.uri.fsPath);
		const bookmarks = this.getBookmarksByPath(rePath);

		const decorations: vscode.DecorationOptions[] = [];

		for (const bm of bookmarks) {
			if (bm.start.line === cursorLine && bm.label && bm.contextValue !== ContextBookmark.BookmarkInvalid) {
				const lineRange = editor.document.lineAt(cursorLine).range;
				decorations.push({
					range: new vscode.Range(
						lineRange.end.line,
						lineRange.end.character,
						lineRange.end.line,
						lineRange.end.character
					),
					renderOptions: {
						after: {
							contentText: `  • ${bm.label}`,
						}
					}
				});
				break; // Only show the first bookmark label on this line
			}
		}

		editor.setDecorations(this._inlineLabelDecorationType, decorations);
	}

	deleteBookmarksData(id: string) {
		this.codeBookmarks.deleteBookmark(id)
	}

	moveChildrenToParentWhenDelete(bookmark: Bookmark): boolean {
		const subs = this.codeBookmarks.findBookmark(bookmark)?.subs
		const out = this.codeBookmarks.findParentBookmark(bookmark)
		if (subs) {
			if (this.codeBookmarks.moveGroupToNode(subs, out)) {
				this.deleteBookmarksData(bookmark.Id)
				this.saveBookmarksToFile()
				this.refreshDecoration()
				return true
			}
		}
		return false
	}

	async forceAddBookmark(editor: vscode.TextEditor) {
		const selections = editor.selections;
		if (selections.length <= 1) {
			// Single cursor: original interactive flow
			const defaultLabel = Helper.getLabelFromSelected(editor)
			
			const label = await vscode.window.showInputBox({ prompt: '请输入书签标签', value: `${defaultLabel}` })
			if (label === undefined || label === null) return
			if (label.trim() === '') {
				logger.showWarningMessage('标签不能为空')
				return
			}
			const filePath = fileUtils.absoluteToRelative(editor.document.uri.fsPath)
			const startPosition = editor.selection.start;
			const endPosition = editor.selection.end;
			let content = ''
			
			if (startPosition.isEqual(endPosition)) {
				content = editor.document.lineAt(startPosition.line).text
			} else {
				const selection = new vscode.Selection(startPosition, endPosition)
				content = editor.document.getText(selection)
			}
			const newBookmark = new Bookmark({
				path: filePath,
				label: label,
				content: content,
				start: new CursorIndex(startPosition.line, startPosition.character),
				end: new CursorIndex(endPosition.line, endPosition.character),
			})

			undoManager.saveState(this.codeBookmarks, 'add');
			const pinBm = this.codeBookmarks.addNewBookmark(newBookmark)
			if (pinBm) {
				this.expandFolderTreeView(pinBm)
			}

			this.saveBookmarksToFile()
			this.refreshDecoration()
		} else {
			// Multi-cursor: batch add bookmarks for all cursor lines with distinct names
			const uniqueSelections = [];
			const processedLines = new Set<number>();
			for (const sel of selections) {
				if (processedLines.has(sel.start.line)) continue;
				processedLines.add(sel.start.line);
				uniqueSelections.push(sel);
			}

			const defaultLabels = uniqueSelections.map(sel => {
				if (sel.isEmpty) {
					return editor.document.lineAt(sel.start.line).text.trim().substring(0, 30) || '未命名';
				} else {
					return editor.document.getText(sel).trim().substring(0, 30) || '未命名';
				}
			});

			const prefillValue = defaultLabels.join(' │ ');

			const labelString = await vscode.window.showInputBox({ 
				prompt: `请输入 ${uniqueSelections.length} 个书签标签（已启用隐写术分隔符“│”）`, 
				value: prefillValue 
			});
			if (labelString === undefined || labelString === null) return;
			
			const labelParts = labelString.split('│').map(s => s.trim());

			const filePath = fileUtils.absoluteToRelative(editor.document.uri.fsPath);
			undoManager.saveState(this.codeBookmarks, 'add');

			for (let i = 0; i < uniqueSelections.length; i++) {
				const sel = uniqueSelections[i];
				const line = sel.start.line;
				const content = editor.document.lineAt(line).text;
				
				let label = labelParts[i];
				if (!label || label === '') {
					label = defaultLabels[i] || '未命名';
				}

				const newBookmark = new Bookmark({
					path: filePath,
					label: label,
					content: content,
					start: new CursorIndex(line, sel.start.character),
					end: new CursorIndex(sel.end.line, sel.end.character),
				});
				this.codeBookmarks.addNewBookmark(newBookmark);
			}

			this.saveBookmarksToFile();
			this.refreshDecoration();
			logger.showMessage(`已为 ${uniqueSelections.length} 个光标位置批量添加了分别命名的书签。`);
		}
	}

	private processAIBookmark(aiBm: any, document: vscode.TextDocument, pathRel: string, parent?: Bookmark): Bookmark | null {
		const line = typeof aiBm.line === 'number' ? aiBm.line : parseInt(aiBm.line) || 0;
		
		let safeLine = line;

		// Correct hallucinated line numbers by searching the exact content in the document
		if (aiBm.content && typeof aiBm.content === 'string') {
			const targetText = aiBm.content.trim();
			if (targetText.length > 5) { // Only search if text is reasonably long
				let foundLine = -1;
				const maxLines = document.lineCount;
				for (let offset = 0; offset < maxLines; offset++) {
					const checkUp = line - offset;
					const checkDown = line + offset;
					
					if (checkUp >= 0 && checkUp < maxLines) {
						if (document.lineAt(checkUp).text.includes(targetText)) {
							foundLine = checkUp;
							break;
						}
					}
					if (checkDown >= 0 && checkDown < maxLines) {
						if (document.lineAt(checkDown).text.includes(targetText)) {
							foundLine = checkDown;
							break;
						}
					}
				}
				if (foundLine !== -1) {
					safeLine = foundLine;
				}
			}
		}

		if (safeLine >= document.lineCount) safeLine = document.lineCount - 1;
		if (safeLine < 0) safeLine = 0;

		const lineText = document.lineAt(safeLine).text;
		
		let newId = aiBm.id;
		if (!newId || typeof newId !== 'string') newId = Helper.createNewId();

		let openedState = vscode.TreeItemCollapsibleState.None;
		const isOpened = false;
		if (aiBm.opened === 2) {
			openedState = vscode.TreeItemCollapsibleState.Expanded;
			// We do NOT set isOpened = true here because that makes it the default target container (green icon)
		} else if (aiBm.opened === 1) {
			openedState = vscode.TreeItemCollapsibleState.Collapsed;
		}

		let parsedParams: number[] = [];
		if (typeof aiBm.params === 'string') {
			parsedParams = aiBm.params.split(',').map(Number);
		}
		
		let startCol = 0;
		let endCol = lineText.length;
		
		if (parsedParams.length === 5) {
			startCol = parsedParams[2] || 0;
			endCol = parsedParams[4] || lineText.length;
		} else if (parsedParams.length === 4) {
			startCol = parsedParams[1] || 0;
			endCol = parsedParams[3] || lineText.length;
		}

		const newBookmark = new Bookmark({
			Id: newId,
			path: pathRel,
			label: aiBm.label || 'AI 生成书签',
			content: lineText,
			icon: aiBm.iconName || '',
			start: new CursorIndex(safeLine, startCol),
			end: new CursorIndex(safeLine, endCol),
			isOpened: isOpened,
			collapsible: openedState,
			parent: parent
		});

		if (aiBm.subs && Array.isArray(aiBm.subs)) {
			for (const sub of aiBm.subs) {
				const childBm = this.processAIBookmark(sub, document, pathRel, newBookmark);
				if (childBm) {
					newBookmark.subs.add(childBm);
				}
			}
		}
		
		// Force expanded state for any bookmark with subs as requested, but ensure it's not a container
		if (newBookmark.subs.size > 0) {
			newBookmark.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
			newBookmark.isOpened = false;
		}

		return newBookmark;
	}

	
	async generateBookmarksWithAI(editor: vscode.TextEditor, mode: 'append' | 'overwrite' | 'skip_existing') {
		const document = editor.document;
		const codeContent = document.getText();
		const pathRel = fileUtils.absoluteToRelative(document.uri.fsPath);

		if (this.runningAITasks.has(pathRel)) {
			vscode.window.showWarningMessage('当前文件已有 AI 任务正在运行，请稍候再试。');
			return;
		}
		this.runningAITasks.add(pathRel);

		const existingBookmarksSet = this.codeBookmarks.getBookmarksWithPath(new BookmarkSet(), pathRel);
		const existingBookmarks = existingBookmarksSet.values;

		if (mode === 'skip_existing' && existingBookmarks.length > 0) {
			vscode.window.showInformationMessage('当前文件已有书签，根据模式已跳过生成。');
			this.runningAITasks.delete(pathRel);
			return;
		}

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'AI 智能代码书签提取运行中...',
			cancellable: true
		}, async (progress, token) => {
			let statusDisposable: vscode.Disposable | undefined;
			try {
				const aiBookmarks = await AIService.generateBookmarks(codeContent, document.uri.fsPath, (msg: string) => {
					if (statusDisposable) statusDisposable.dispose();
					statusDisposable = vscode.window.setStatusBarMessage(`AI: ${msg}`);
				}, token);
				
				if (token.isCancellationRequested) return;

				if (!aiBookmarks || aiBookmarks.length === 0) {
					vscode.window.showInformationMessage('AI 未能发现需要添加书签的核心逻辑。');
					return;
				}

				if (statusDisposable) statusDisposable.dispose();
				statusDisposable = vscode.window.setStatusBarMessage('AI: 正在将智能书签落盘保存...');
				
				undoManager.saveState(this.codeBookmarks, 'ai');

				if (mode === 'overwrite') {
					for (const eb of existingBookmarks) {
						if (eb.Id) {
							this.deleteBookmarksData(eb.Id);
						}
					}
				}
				
				let count = 0;
				for (const aiBm of aiBookmarks) {
					const newBookmark = this.processAIBookmark(aiBm, document, pathRel);
					if (newBookmark) {
						this.codeBookmarks.addNewBookmark(newBookmark);
						count++;
					}
				}

				this.saveBookmarksToFile([document.uri.fsPath]);
				this._onDidChangeTreeData.fire();
				this.refreshDecoration();
				vscode.window.showInformationMessage(`AI 分析完成，成功生成并处理了 ${count} 个主级书签！`);
				
			} catch (err: any) {
				if (err.message && err.message.includes('主动取消')) {
					vscode.window.showInformationMessage('已取消 AI 书签生成任务。');
				} else {
					vscode.window.showErrorMessage(`AI 书签生成失败：${err.message}`);
				}
			} finally {
				if (statusDisposable) statusDisposable.dispose();
				this.runningAITasks.delete(pathRel);
			}
		});
	}

	async optimizeBookmarksWithAI(editor: vscode.TextEditor) {
		const document = editor.document;
		const codeContent = document.getText();
		const pathRel = fileUtils.absoluteToRelative(document.uri.fsPath);

		if (this.runningAITasks.has(pathRel)) {
			vscode.window.showWarningMessage('当前文件已有 AI 任务正在运行，请稍候再试。');
			return;
		}
		
		const existingBookmarksSet = this.codeBookmarks.getBookmarksWithPath(new BookmarkSet(), pathRel);
		const existingBookmarks = existingBookmarksSet.values;

		if (existingBookmarks.length === 0) {
			vscode.window.showInformationMessage('当前文件没有可以优化的书签。');
			return;
		}

		this.runningAITasks.add(pathRel);

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'AI 书签标签优化运行中...',
			cancellable: true
		}, async (progress, token) => {
			let statusDisposable: vscode.Disposable | undefined;
			try {
				const optimizedList = await AIService.optimizeBookmarkTitles(codeContent, document.uri.fsPath, existingBookmarks, (msg: string) => {
					if (statusDisposable) statusDisposable.dispose();
					statusDisposable = vscode.window.setStatusBarMessage(`AI: ${msg}`);
				}, token);
				
				if (token.isCancellationRequested) return;

				if (!optimizedList || optimizedList.length === 0) {
					vscode.window.showInformationMessage('AI 未返回任何有效的标签更新。');
					return;
				}

				if (statusDisposable) statusDisposable.dispose();
				statusDisposable = vscode.window.setStatusBarMessage('AI: 正在应用优化后的标签...');

				let fileHasChanges = false;
				undoManager.saveState(this.codeBookmarks, 'ai-optimize');

				for (const opt of optimizedList) {
					if (opt.id && opt.new_label) {
						const bm = this.codeBookmarks.findBookmark(new Bookmark({ Id: opt.id }));
						if (bm) {
							bm.label = Helper.formatLabelSpacing(opt.new_label);
							fileHasChanges = true;
						}
					}
				}

				if (fileHasChanges) {
					this.saveBookmarksToFile([document.uri.fsPath]);
					this._onDidChangeTreeData.fire();
					this.refreshDecoration();
					vscode.window.showInformationMessage('AI 标签优化完成！');
				} else {
					vscode.window.showInformationMessage('AI 标签优化完成，但没有内容改变。');
				}
				
			} catch (err: any) {
				if (err.message && err.message.includes('主动取消')) {
					vscode.window.showInformationMessage('已取消 AI 标签优化任务。');
				} else {
					vscode.window.showErrorMessage(`AI 标签优化失败：${err.message}`);
				}
			} finally {
				if (statusDisposable) statusDisposable.dispose();
				this.runningAITasks.delete(pathRel);
			}
		});
	}

	async getScriptFilesInFolder(dirPath: string, token: vscode.CancellationToken): Promise<string[]> {
		const files: string[] = [];
		const allowedExts = ['.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.java', '.go', '.cpp', '.c', '.cs', '.php', '.rb', '.rs', '.swift', '.kt'];
		
		async function traverse(currentPath: string) {
			if (token.isCancellationRequested) return;
			const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
			for (const entry of entries) {
				if (token.isCancellationRequested) return;
				const fullPath = path.join(currentPath, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'build' && entry.name !== 'out') {
						await traverse(fullPath);
					}
				} else if (entry.isFile()) {
					const ext = path.extname(entry.name).toLowerCase();
					if (allowedExts.includes(ext)) {
						files.push(fullPath);
					}
				}
			}
		}
		
		await traverse(dirPath);
		return files;
	}

	async generateBookmarksForFolderWithAI(editor: vscode.TextEditor, mode: 'append' | 'overwrite' | 'skip_existing') {
		const dirPath = path.dirname(editor.document.uri.fsPath);
		
		const dummyTokenSource = new vscode.CancellationTokenSource();
		const filesToProcess = await this.getScriptFilesInFolder(dirPath, dummyTokenSource.token);
		
		if (filesToProcess.length === 0) {
			vscode.window.showInformationMessage('未在当前文件夹及其子目录中找到支持的脚本文件。');
			return;
		}

		if (filesToProcess.length > 10) {
			const confirm = await vscode.window.showWarningMessage(`当前文件夹（包含子目录）共扫描到 ${filesToProcess.length} 个脚本文件，批量处理可能需要较长时间并大量消耗 AI API 的额度。确定要继续吗？`,
				{ modal: true },
				'确定'
			);
			if (confirm !== '确定') {
				return;
			}
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'AI 批量智能提取书签运行中...',
			cancellable: true
		}, async (progress, token) => {
			let totalCount = 0;
			let fileCount = 0;
			let failedFilesCount = 0;
			const changedPaths: string[] = [];
			let statusDisposable: vscode.Disposable | undefined;
			let hasSavedUndoState = false;

			for (const filePath of filesToProcess) {
				const pathRel = fileUtils.absoluteToRelative(filePath);
				if (this.runningAITasks.has(pathRel)) {
					vscode.window.showWarningMessage(`文件 ${path.basename(filePath)} 正在进行 AI 任务，请稍后再试。`);
					continue;
				}
				
				let codeContent = '';
				try {
					codeContent = (await fs.promises.readFile(filePath, 'utf8')).toString();
				} catch {
					vscode.window.showErrorMessage(`无法读取文件源码: ${filePath}`);
					continue;
				}

				this.runningAITasks.add(pathRel);
				fileCount++;
				progress.report({ message: `(${fileCount}/${filesToProcess.length}) 正在提取: ${path.basename(filePath)}` });

				try {
					const existingBookmarksSet = this.codeBookmarks.getBookmarksWithPath(new BookmarkSet(), pathRel);
					const existingBookmarks = existingBookmarksSet.values;

					if (mode === 'skip_existing' && existingBookmarks.length > 0) {
						this.runningAITasks.delete(pathRel);
						continue;
					}

					const aiBookmarks = await AIService.generateBookmarks(codeContent, filePath, (msg: string) => {
						if (statusDisposable) statusDisposable.dispose();
						statusDisposable = vscode.window.setStatusBarMessage(`AI: ${msg}`);
					}, token);
					
					if (token.isCancellationRequested) {
						this.runningAITasks.delete(pathRel);
						break;
					}

					if (aiBookmarks && aiBookmarks.length > 0) {
						let fileHasChanges = false;
						const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));

						if (!hasSavedUndoState) {
							undoManager.saveState(this.codeBookmarks, 'ai');
							hasSavedUndoState = true;
						}

						if (mode === 'overwrite') {
							for (const eb of existingBookmarks) {
								if (eb.Id) {
									this.deleteBookmarksData(eb.Id);
									fileHasChanges = true;
								}
							}
						}

						for (const aiBm of aiBookmarks) {
							const newBookmark = this.processAIBookmark(aiBm, document, pathRel);
							if (newBookmark) {
								this.codeBookmarks.addNewBookmark(newBookmark);
								fileHasChanges = true;
								totalCount++;
							}
						}

						if (fileHasChanges) {
							changedPaths.push(filePath);
						}
					}
				} catch (err: any) {
					failedFilesCount++;
					if (err.message && (err.message.includes('401') || err.message.includes('API Key'))) {
						vscode.window.showErrorMessage(`接口验证失败，请检查 API Key 配置: ${err.message}`);
						this.runningAITasks.delete(pathRel);
						break; // Fatal error, abort batch
					}
					logger.error(`[AI Batch Generate] Failed for ${pathRel}: ${err.message}`);
				} finally {
					this.runningAITasks.delete(pathRel);
				}
			}

			if (changedPaths.length > 0) {
				this.saveBookmarksToFile(changedPaths);
				this._onDidChangeTreeData.fire();
				this.refreshDecoration();
				const failMsg = failedFilesCount > 0 ? `（有 ${failedFilesCount} 个文件处理失败）` : '';
				vscode.window.showInformationMessage(`文件夹 AI 处理完成，在 ${changedPaths.length} 个文件中生成了 ${totalCount} 个书签！${failMsg}`);
			} else if (!token.isCancellationRequested) {
				const failMsg = failedFilesCount > 0 ? `（其中 ${failedFilesCount} 个文件处理失败）` : '';
				vscode.window.showInformationMessage(`AI 处理完毕，没有生成新的书签。${failMsg}`);
			}
			if (statusDisposable) statusDisposable.dispose();
		});
	}

	async optimizeBookmarksForFolderWithAI(editor: vscode.TextEditor) {
		const dirPath = path.dirname(editor.document.uri.fsPath);
		
		const dummyTokenSource = new vscode.CancellationTokenSource();
		const files = await this.getScriptFilesInFolder(dirPath, dummyTokenSource.token);
		
		if (files.length === 0) {
			vscode.window.showInformationMessage('未在当前文件夹及其子目录中找到支持的脚本文件。');
			return;
		}

		if (files.length > 10) {
			const confirm = await vscode.window.showWarningMessage(`当前文件夹（包含子目录）共扫描到 ${files.length} 个脚本文件，批量处理可能需要较长时间并大量消耗 AI API 的额度。确定要继续吗？`,
				{ modal: true },
				'确定'
			);
			if (confirm !== '确定') {
				return;
			}
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'AI 正在扫描文件夹中的书签...',
			cancellable: true
		}, async (progress, token) => {
			let totalCount = 0;
			let fileCount = 0;
			let failedFilesCount = 0;
			const changedPaths: string[] = [];
			let statusDisposable: vscode.Disposable | undefined;
			let hasSavedUndoState = false;

			for (const filePath of files) {
				const pathRel = fileUtils.absoluteToRelative(filePath);
				if (this.runningAITasks.has(pathRel)) {
					vscode.window.showWarningMessage(`文件 ${path.basename(filePath)} 正在进行 AI 任务，请稍后再试。`);
					continue;
				}

				const existingBookmarksSet = this.codeBookmarks.getBookmarksWithPath(new BookmarkSet(), pathRel);
				const existingBookmarks = existingBookmarksSet.values;

				if (existingBookmarks.length === 0) {
					continue; // skip files without bookmarks
				}
				
				let codeContent = '';
				try {
					codeContent = (await fs.promises.readFile(filePath, 'utf8')).toString();
				} catch {
					vscode.window.showErrorMessage(`无法读取文件源码: ${filePath}`);
					continue;
				}

				this.runningAITasks.add(pathRel);
				fileCount++;
				progress.report({ message: `(${fileCount}/${files.length}) 正在优化: ${path.basename(filePath)}` });

				try {
					const optimizedList = await AIService.optimizeBookmarkTitles(codeContent, filePath, existingBookmarks, (msg: string) => {
						if (statusDisposable) statusDisposable.dispose();
						statusDisposable = vscode.window.setStatusBarMessage(`AI: ${msg}`);
					}, token);
					
					if (token.isCancellationRequested) {
						this.runningAITasks.delete(pathRel);
						break;
					}

					if (optimizedList && optimizedList.length > 0) {
						let fileHasChanges = false;
						
						if (!hasSavedUndoState) {
							undoManager.saveState(this.codeBookmarks, 'ai-optimize');
							hasSavedUndoState = true;
						}

						for (const opt of optimizedList) {
							if (opt.id && opt.new_label) {
								const bm = this.codeBookmarks.findBookmark(new Bookmark({ Id: opt.id }));
								if (bm) {
									bm.label = Helper.formatLabelSpacing(opt.new_label);
									fileHasChanges = true;
									totalCount++;
								}
							}
						}

						if (fileHasChanges) {
							changedPaths.push(filePath);
						}
					}
				} catch (err: any) {
					failedFilesCount++;
					if (err.message && (err.message.includes('401') || err.message.includes('API Key'))) {
						vscode.window.showErrorMessage(`接口验证失败，请检查 API Key 配置: ${err.message}`);
						this.runningAITasks.delete(pathRel);
						break; // Fatal error, abort batch
					}
					logger.error(`[AI Batch Optimize] Failed for ${pathRel}: ${err.message}`);
				} finally {
					this.runningAITasks.delete(pathRel);
				}
			}

			if (changedPaths.length > 0) {
				this.saveBookmarksToFile(changedPaths);
				this._onDidChangeTreeData.fire();
				this.refreshDecoration();
				const failMsg = failedFilesCount > 0 ? `（有 ${failedFilesCount} 个文件处理失败）` : '';
				vscode.window.showInformationMessage(`文件夹 AI 优化完成，在 ${changedPaths.length} 个文件中重命名了 ${totalCount} 个书签！${failMsg}`);
			} else if (!token.isCancellationRequested) {
				const failMsg = failedFilesCount > 0 ? `（其中 ${failedFilesCount} 个文件处理失败）` : '';
				vscode.window.showInformationMessage(`AI 处理完毕，没有更新任何书签。${failMsg}`);
			}
			if (statusDisposable) statusDisposable.dispose();
		});
	}

	public async optimizeSelectedBookmarksWithAI(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		let targets: Bookmark[] = [];
		if (selectedBookmarks && selectedBookmarks.length > 1) {
			targets = selectedBookmarks;
		} else if (this.treeView && this.treeView.selection.length > 1) {
			const isBmInSelection = bm ? this.treeView.selection.some(s => s.Id === bm.Id) : true;
			if (isBmInSelection) {
				targets = [...this.treeView.selection];
			} else {
				targets = [bm!];
			}
		} else {
			const target = bm || (this.treeView?.selection.length ? this.treeView.selection[0] : undefined);
			if (target) targets.push(target);
		}

		if (targets.length === 0) return;

		const bookmarksToOptimize = targets.filter(b => b.contextValue === ContextBookmark.Bookmark || b.contextValue === ContextBookmark.BookmarkPinned);
		if (bookmarksToOptimize.length === 0) {
			vscode.window.showInformationMessage('选中的项不包含可优化的书签。');
			return;
		}

		const groupedByPath = new Map<string, Bookmark[]>();
		for (const bm of bookmarksToOptimize) {
			const filePath = fileUtils.relativeToAbsolute(bm.path);
			if (!groupedByPath.has(filePath)) {
				groupedByPath.set(filePath, []);
			}
			groupedByPath.get(filePath)!.push(bm);
		}

		let totalOptimizedCount = 0;
		const changedPaths: string[] = [];
		let hasSavedUndoState = false;

		for (const [filePath, bookmarks] of groupedByPath.entries()) {
			const pathRel = fileUtils.absoluteToRelative(filePath);
			if (this.runningAITasks.has(pathRel)) {
				vscode.window.showWarningMessage(`文件 ${path.basename(filePath)} 正在进行 AI 任务，请稍后再试。`);
				continue;
			}
			
			let fileContent = '';
			try {
				fileContent = (await fs.promises.readFile(filePath, 'utf8')).toString();
			} catch {
				vscode.window.showErrorMessage(`无法读取文件源码: ${filePath}`);
				continue;
			}

			this.runningAITasks.add(pathRel);
			try {
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: `AI 正在优化 ${path.basename(filePath)} 中的 ${bookmarks.length} 个书签标签...`,
					cancellable: true
				}, async (progress, token) => {
					let statusDisposable: vscode.Disposable | undefined;
					try {
						const optimizedList = await AIService.optimizeBookmarkTitles(fileContent, filePath, bookmarks, (msg: string) => {
							if (statusDisposable) statusDisposable.dispose();
							statusDisposable = vscode.window.setStatusBarMessage(`AI: ${msg}`);
						}, token);

						let count = 0;
						if (optimizedList && optimizedList.length > 0) {
							for (const opt of optimizedList) {
								if (opt.id && opt.new_label) {
									const bm = this.codeBookmarks.findBookmark(new Bookmark({ Id: opt.id }));
									if (bm) {
										if (!hasSavedUndoState) {
											undoManager.saveState(this.codeBookmarks, 'ai-optimize');
											hasSavedUndoState = true;
										}
										bm.label = Helper.formatLabelSpacing(opt.new_label);
										count++;
										totalOptimizedCount++;
									}
								}
							}
							
							if (count > 0) {
								this.saveBookmarksToFile([filePath]);
								this.refreshDecoration();
								this.refresh();
								vscode.window.showInformationMessage(`成功优化了 ${count} 个选中书签的标签！`);
							} else {
								vscode.window.showInformationMessage('AI 未能返回任何有效的标签更新。');
							}
						}
					} finally {
						if (statusDisposable) statusDisposable.dispose();
					}
				});
			} catch (error: any) {
				if (error.message && error.message.includes('已取消')) {
					vscode.window.showInformationMessage(`已取消 AI 选中书签优化任务：${path.basename(filePath)}`);
				} else {
					vscode.window.showErrorMessage(`AI 优化选中书签失败：${error}`);
				}
			} finally {
				this.runningAITasks.delete(pathRel);
			}
		}
	}


	private isExpanded = false;
	async toggleExpandCollapse() {
		if (this.isExpanded) {
			await this._collapseAll();
			this.isExpanded = false;
		} else {
			const roots = await this.getChildren();
			const expandRecursive = async (items: any[]) => {
				for (const item of items) {
					try { await this.treeView?.reveal(item, { expand: true, select: false, focus: false }); } catch (e) {}
					const children = await this.getChildren(item);
					if (children.length > 0) {
						await expandRecursive(children);
					}
				}
			};
			await expandRecursive(roots);
			this.isExpanded = true;
		}
		vscode.commands.executeCommand('setContext', 'codebookmark.var.isExpanded', this.isExpanded);
	}

	async expandFolderTreeView(bookmark: any) {
		if (this.treeView) {
			try {
				await this.treeView.reveal(bookmark, { select: true, focus: false, expand: true });
			} catch (_) {}
		}
	}

	private smartTrackTimer: NodeJS.Timeout | undefined;

	changeContentFile(event: vscode.TextDocumentChangeEvent) {
		if (event.contentChanges.length === 0 || vscode.window.activeTextEditor === undefined || event.document.uri.scheme !== 'file') {
			return;
		}

		if (this.smartTrackTimer) {
			clearTimeout(this.smartTrackTimer);
		}

		this.smartTrackTimer = setTimeout(() => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const pathRel = fileUtils.absoluteToRelative(editor.document.uri.fsPath);
			const bookmarks = this.codeBookmarks.getBookmarksWithPath(new BookmarkSet(), pathRel).values;
			if (bookmarks.length === 0) return;

			let hasChange = false;
			for (const change of event.contentChanges) {
				const linesDelta = change.text.split('\n').length - 1 - (change.range.end.line - change.range.start.line);
				if (linesDelta === 0) continue;

				for (const bm of bookmarks) {
					if (bm.start.line > change.range.start.line) {
						bm.start.line += linesDelta;
						bm.end.line += linesDelta;
						
						hasChange = true;
					}
				}
			}

			if (hasChange) {
				this.saveBookmarksToFile([editor.document.uri.fsPath]);
				this.refreshDecoration();
			}
		}, 300);
	}

	async forceDeleteBookmark(editor: vscode.TextEditor) {
		const processedLines = new Set<number>();
		let hasChange = false;

		for (const sel of editor.selections) {
			const lineNumber = sel.start.line;
			if (processedLines.has(lineNumber)) continue;
			processedLines.add(lineNumber);

			const lines = this.getLinePaths(editor, this.codeBookmarks);
			const linePath = lines.get(lineNumber);
			if (linePath) {
				if (!hasChange) {
					undoManager.saveState(this.codeBookmarks, 'delete');
				}
				for (const id of linePath.ids) {
					this.deleteBookmarksData(id);
					hasChange = true;
				}
			}
		}

		if (hasChange) {
			this.saveBookmarksToFile([editor.document.uri.fsPath]);
			this.refreshDecoration();
		}
	}

	async toggleBookmark(editor: vscode.TextEditor) {
		const processedLines = new Set<number>();
		let anyAdded = false;
		let anyDeleted = false;

		for (const sel of editor.selections) {
			const lineNumber = sel.start.line;
			if (processedLines.has(lineNumber)) continue;
			processedLines.add(lineNumber);

			const lines = this.getLinePaths(editor, this.codeBookmarks);
			const count = lines.get(lineNumber);

			if (count) {
				if (!anyDeleted && !anyAdded) {
					undoManager.saveState(this.codeBookmarks, 'delete');
				}
				for (const id of count.ids) {
					this.deleteBookmarksData(id);
				}
				anyDeleted = true;
			} else {
				anyAdded = true;
			}
		}

		if (anyAdded) {
			if (processedLines.size === 1 || !anyDeleted) {
				await this.forceAddBookmark(editor);
				return;
			}
		}

		if (anyDeleted) {
			this.saveBookmarksToFile([editor.document.uri.fsPath]);
			this.refreshDecoration();
		}
	}

	private async _collapseAll() {
		// 利用 VS Code 内置命令折叠当前视图的所有节点
		// 需要先聚焦到我们的 treeView
		await vscode.commands.executeCommand(`${Commands.codeBookmarkViewName}.focus`);
		await vscode.commands.executeCommand('list.collapseAll');
	}

	getLinePaths(editor: vscode.TextEditor, setBookmark: BookmarkSet): Map<number, LinePath> {
		const path = fileUtils.absoluteToRelative(editor.document.uri.fsPath)
		const bookmarks = this.getBookmarksByPath(path)
		const lines = new Map<number, LinePath>([])
		for (const bookmark of bookmarks) {
			const c = lines.get(bookmark.start.line)
			if (c) {
				c.ids.push(bookmark.Id)
				// lines.set is not needed since the array reference is mutated
			} else {
				lines.set(bookmark.start.line, new LinePath(path, bookmark.start.line, bookmark.Id))
			}
		}
		return lines
	}
	// **************** file
	private ignoreWatchUntil = 0;
	private saveRequests: Map<string, Bookmark[]> = new Map();
	private timerSave = setTimeout(() => {
		if (this.saveRequests.size > 0) {
			this.ignoreWatchUntil = Date.now() + 1500;
			const firstPath = Array.from(this.saveRequests.keys())[0];
			let isWorkspace = fileUtils.isWorkspaceMode();
			if (firstPath) {
				isWorkspace = fileUtils.isWorkspaceMode(vscode.Uri.file(firstPath));
			}

			if (isWorkspace) {
				const dummyTree = new BookmarkSet();
				const latestBms = Array.from(this.saveRequests.values()).pop();
				dummyTree.values = latestBms || [];
				bookmarkRepository.saveBookmarksToFile(this.context, dummyTree, firstPath ? [firstPath] : []);
			} else {
				for (const [fsPath, bms] of this.saveRequests.entries()) {
					const dummyTree = new BookmarkSet();
					dummyTree.values = bms;
					bookmarkRepository.saveBookmarksToFile(this.context, dummyTree, [fsPath]);
				}
			}
			this.saveRequests.clear();
		}
	}, 500);
	saveBookmarksToFile(paths?: string[]) {
		if (paths && paths.length > 0) {
			for (const p of paths) {
				this.saveRequests.set(p, [...this.codeBookmarks.values]);
			}
			this.timerSave.refresh();
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri.scheme === 'file') {
			this.saveRequests.set(editor.document.uri.fsPath, [...this.codeBookmarks.values]);
			this.timerSave.refresh();
		} else {
			const allPaths = new Set(this.codeBookmarks.values.map(b => fileUtils.relativeToAbsolute(b.path)));
			for (const p of allPaths) {
				this.saveRequests.set(p, [...this.codeBookmarks.values]);
			}
			this.timerSave.refresh();
		}
	}

	async getBookmarksLocal() {
		const editor = vscode.window.activeTextEditor;
		const isWorkspace = editor ? fileUtils.isWorkspaceMode(editor.document.uri) : fileUtils.isWorkspaceMode();

		if (!this.forceNextLoad && isWorkspace && this.currentModeIsWorkspace === true) {
			return;
		}
		this.forceNextLoad = false;
		this.currentModeIsWorkspace = isWorkspace;

		const activePaths = editor ? [editor.document.uri.fsPath] : [];
		const arr = await bookmarkRepository.readBookmarksFromFile(this.context, activePaths)

		// 1. Preserve pinned state BEFORE clearing the current state
		const pinnedIds = new Set<string>();
		const preservePinned = (bms: Bookmark[]) => {
			for (const bm of bms) {
				if (bm.isOpened) pinnedIds.add(bm.Id);
				if (bm.subs.size > 0) preservePinned(Array.from(bm.subs.values));
			}
		};
		preservePinned(Array.from(this.codeBookmarks.values));

		// 2. Clear current bookmarks
		this.codeBookmarks.clear()

		// 3. Process new bookmarks from file
		for (const bm of arr) {
			if (bm.path === '') {
				bm.path = editor ? fileUtils.absoluteToRelative(editor.document.uri.fsPath) : '';
			} else if (path.isAbsolute(bm.path)) {
				// Compatibility: If a single-script config (which used absolute paths) is dropped into a workspace config,
				// convert it to relative path so it matches the current workspace.
				bm.path = fileUtils.absoluteToRelative(bm.path);
			}
		}

		// 4. Add the processed bookmarks to the tree
		this.codeBookmarks.addAll(arr)

		const restorePinned = (bms: Bookmark[]) => {
			for (const bm of bms) {
				if (pinnedIds.has(bm.Id)) {
					bm.isOpened = true;
					bm.contextValue = ContextBookmark.BookmarkPinned;
					bm.refreshDisplayProps();
				}
				if (bm.subs.size > 0) restorePinned(Array.from(bm.subs.values));
			}
		};
		restorePinned(Array.from(this.codeBookmarks.values));

		this._onDidChangeTreeData.fire()
		await this.readBookmarksContent()
		if (editor) {
			this.refreshDecoration()
		}
	}

	async readBookmarksContent() {
		await fileUtils.readContentBookmarkInFile(this.codeBookmarks)
	}

	async onSearchInFile() {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			logger.showWarningMessage('当前没有打开的文件');
			return;
		}
		const path = fileUtils.absoluteToRelative(editor.document.uri.fsPath);
		const bookmarks = this.codeBookmarks.getBookmarksWithPath(new BookmarkSet(), path);
		if (bookmarks.size === 0) {
			logger.showWarningMessage('当前文件无书签');
			return;
		}

		const items: (vscode.QuickPickItem & { bookmark: Bookmark })[] = Array.from(bookmarks.values).map(bm => ({
			label: `$(bookmark) ${bm.label}`,
			description: `第 ${bm.start.line + 1} 行`,
			detail: bm.content,
			bookmark: bm
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: '搜索当前文件的书签',
			matchOnDescription: true,
			matchOnDetail: true
		});

		if (selected) {
			vscode.commands.executeCommand(Commands.openBookmark, selected.bookmark);
		}
	}

	async onSort() {
		const options: vscode.QuickPickItem[] = [
			{ label: '自定义排序', description: SortModeBookmark.mode === SortModeBookmark.Custom ? '(当前)' : '' },
			{ label: '按时间升序', description: SortModeBookmark.mode === SortModeBookmark.TimeAsc ? '(当前)' : '最早添加在前' },
			{ label: '按时间降序', description: SortModeBookmark.mode === SortModeBookmark.TimeDesc ? '(当前)' : '最新添加在前' },
			{ label: '按位置升序', description: SortModeBookmark.mode === SortModeBookmark.LineAsc ? '(当前)' : '从上到下' },
			{ label: '按位置降序', description: SortModeBookmark.mode === SortModeBookmark.LineDesc ? '(当前)' : '从下到上' },
		];

		const selected = await vscode.window.showQuickPick(options, {
			placeHolder: '选择视图排序方式（不影响底层拖拽原始顺序）'
		});

		if (selected) {
			if (selected.label === '自定义排序') SortModeBookmark.mode = SortModeBookmark.Custom;
			else if (selected.label === '按时间升序') SortModeBookmark.mode = SortModeBookmark.TimeAsc;
			else if (selected.label === '按时间降序') SortModeBookmark.mode = SortModeBookmark.TimeDesc;
			else if (selected.label === '按位置升序') SortModeBookmark.mode = SortModeBookmark.LineAsc;
			else if (selected.label === '按位置降序') SortModeBookmark.mode = SortModeBookmark.LineDesc;

			this._onDidChangeTreeData.fire();
		}
	}

	public refreshing = false
	private currentModeIsWorkspace: boolean | undefined = undefined;
	public forceNextLoad = false;
	
	private timeRefresh: NodeJS.Timeout = setTimeout(() => {
		this.refreshing = false
		this.initViewEditor()
	}, 100);

	reloadActiveTab(forceReloadDisk: boolean = false) {
		const editor = vscode.window.activeTextEditor;
		const isWorkspace = editor ? fileUtils.isWorkspaceMode(editor.document.uri) : fileUtils.isWorkspaceMode();
		this.refresh(editor, isWorkspace, forceReloadDisk);
	}

	public async refresh(editor?: vscode.TextEditor, isWorkspace?: boolean, forceReloadDisk: boolean = false) {
		const config = vscode.workspace.getConfiguration('codebookmark');
		
		if (forceReloadDisk || this.currentModeIsWorkspace !== isWorkspace) {
			this.workspaceOrderCache = null;
			this.forceNextLoad = true;
		}
		
		if (!forceReloadDisk && isWorkspace && this.currentModeIsWorkspace === true) {
			if (editor) {
				const rePath = fileUtils.absoluteToRelative(editor.document.uri.fsPath);
				const fileNode = this.fileNodesCache.get(rePath);
				if (fileNode && this.treeView?.visible) {
					setTimeout(() => {
						try {
							this.treeView?.reveal(fileNode, { expand: true, select: false, focus: false });
						} catch (e) {}
					}, 10);
				}
			}
			return;
		}

		if (forceReloadDisk) {
			this.forceNextLoad = true;
		}

		this.currentModeIsWorkspace = isWorkspace;
		this.refreshing = true
		
		clearTimeout(this.timeRefresh);
		this.timeRefresh = setTimeout(() => {
			this.refreshing = false;
			this.initViewEditor().then(() => {
				if (isWorkspace && editor && this.treeView?.visible) {
					const rePath = fileUtils.absoluteToRelative(editor.document.uri.fsPath);
					const fileNode = this.fileNodesCache.get(rePath);
					if (fileNode) {
						setTimeout(() => {
							try {
								this.treeView?.reveal(fileNode, { expand: true, select: false, focus: false });
							} catch (e) {}
						}, 10);
					}
				}
			});
		}, 100);
	}

	// On click item button
	async onRenameBookmark(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		let targets: Bookmark[] = [];
		if (selectedBookmarks && selectedBookmarks.length > 1) {
			targets = selectedBookmarks;
		} else if (this.treeView && this.treeView.selection.length > 1) {
			const isBmInSelection = bm ? this.treeView.selection.some(s => s.Id === bm.Id) : true;
			if (isBmInSelection) {
				targets = [...this.treeView.selection];
			} else {
				targets = [bm!];
			}
		} else {
			const target = bm || (this.treeView?.selection.length ? this.treeView.selection[0] : undefined);
			if (target) targets.push(target);
		}

		if (targets.length === 0) return;

		const resolvedTargets = targets
			.map(t => this.codeBookmarks.findBookmark(t))
			.filter(t => t !== undefined && !t.isBookmarkInvalid) as Bookmark[];

		if (resolvedTargets.length === 0) return;

		if (resolvedTargets.length === 1) {
			await this._editLabel(resolvedTargets[0]);
			return;
		}

		const getDepth = (bookmark: Bookmark) => {
			let depth = 0;
			let curr = bookmark.parent;
			while (curr) {
				depth++;
				curr = curr.parent;
			}
			return depth;
		};

		undoManager.saveState(this.codeBookmarks, 'rename');

		// Batch Rename via Temporary File to avoid dirty prompt
		const tmpPath = vscode.Uri.file(`${fileUtils.getGlobalBookmarkFolder()}/batch-rename-${Date.now()}.txt`);
		const content = resolvedTargets.map(bm => '\t'.repeat(getDepth(bm)) + bm.label).join('\n');
		
		await fs.promises.writeFile(tmpPath.fsPath, content, 'utf8');

		const doc = await vscode.workspace.openTextDocument(tmpPath);
		await vscode.window.showTextDocument(doc, { preview: false });

		vscode.window.showInformationMessage(`提示：按 Tab 键体现的层级仅供参考，请直接修改行内文字，修改完成后直接关闭该面板即可自动生效。`);

		const changeDisposable = vscode.workspace.onDidChangeTextDocument(async (e) => {
			if (e.document === doc && doc.isDirty) {
				await doc.save();
			}
		});

		const closeDisposable = vscode.workspace.onDidCloseTextDocument(async (closedDoc) => {
			if (closedDoc === doc) {
				const lines = doc.getText().split('\n');
				let hasChanges = false;
				const changedPaths = new Set<string>();
				
				for (let i = 0; i < resolvedTargets.length && i < lines.length; i++) {
					const newLabel = lines[i].replace(/^\t+/, '').trim();
					if (newLabel && newLabel !== resolvedTargets[i].label) {
						resolvedTargets[i].label = Helper.formatLabelSpacing(newLabel);
						hasChanges = true;
						changedPaths.add(fileUtils.relativeToAbsolute(resolvedTargets[i].path));
					}
				}
				
				if (hasChanges) {
					this.refreshDecoration();
					this.saveBookmarksToFile(Array.from(changedPaths));
					logger.showMessage(`成功批量重命名了多个书签！`);
				}

				changeDisposable.dispose();
				closeDisposable.dispose();

				try {
					await fs.promises.unlink(tmpPath.fsPath);
				} catch (e) {}
			}
		});
	}

	async editBookmark_editLabel(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		await this.onRenameBookmark(bm, selectedBookmarks);
	}

	async editBookmark_updatePosOnly(bm: Bookmark) {
		const bookmark = this.codeBookmarks.findBookmark(bm)
		if (bookmark === undefined) return
		this._replaceBookmark(bookmark)
	}

	async editBookmark_updatePosAndRename(bm: Bookmark) {
		const bookmark = this.codeBookmarks.findBookmark(bm)
		if (bookmark === undefined) return
		const editor = vscode.window.activeTextEditor
		if (!editor || editor.document.lineAt(editor.selection.start.line).text === '') {
			vscode.window.showWarningMessage("当前光标行为空，无法重命名书签！")
			return
		}
		undoManager.saveState(this.codeBookmarks, 'rename');
		if (await this._editLabel(bookmark, true)) {
			this._replaceBookmark(bookmark, true)
		}
	}

	async editBookmark_changeIcon(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		let targets: Bookmark[] = [];
		if (selectedBookmarks && selectedBookmarks.length > 1) {
			targets = selectedBookmarks;
		} else if (this.treeView && this.treeView.selection.length > 1) {
			const isBmInSelection = bm ? this.treeView.selection.some(s => s.Id === bm.Id) : true;
			if (isBmInSelection) {
				targets = [...this.treeView.selection];
			} else {
				targets = [bm!];
			}
		} else {
			const target = bm || (this.treeView?.selection.length ? this.treeView.selection[0] : undefined);
			if (target) targets.push(target);
		}

		if (targets.length === 0) return;

		const resolvedTargets = targets
			.map(t => this.codeBookmarks.findBookmark(t))
			.filter(t => t !== undefined && !t.isBookmarkInvalid) as Bookmark[];

		if (resolvedTargets.length === 0) return;

		let initialIcon = resolvedTargets[0].icon || '';
		for (let i = 1; i < resolvedTargets.length; i++) {
			if ((resolvedTargets[i].icon || '') !== initialIcon) {
				initialIcon = '';
				break;
			}
		}

		IconPickerWebview.createOrShow(this.context, 'batch_change_icon', initialIcon, (iconName, _) => {
			let changed = false;
			const changedPaths = new Set<string>();
			undoManager.saveState(this.codeBookmarks, 'icon');
			
			for (const bookmark of resolvedTargets) {
				if (bookmark.icon !== iconName) {
					bookmark.icon = iconName;
					changed = true;
					changedPaths.add(fileUtils.relativeToAbsolute(bookmark.path));
				}
			}
			
			if (changed) {
				this.saveBookmarksToFile(Array.from(changedPaths));
				this.refreshDecoration();
			}
		});
	}

	async editBookmark_restoreDefaultIcon(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		let targets: Bookmark[] = [];
		if (selectedBookmarks && selectedBookmarks.length > 1) {
			targets = selectedBookmarks;
		} else if (this.treeView && this.treeView.selection.length > 1) {
			const isBmInSelection = bm ? this.treeView.selection.some(s => s.Id === bm.Id) : true;
			if (isBmInSelection) {
				targets = [...this.treeView.selection];
			} else {
				targets = [bm!];
			}
		} else {
			const target = bm || (this.treeView?.selection.length ? this.treeView.selection[0] : undefined);
			if (target) targets.push(target);
		}

		if (targets.length === 0) return;

		const resolvedTargets = targets
			.map(t => this.codeBookmarks.findBookmark(t))
			.filter(t => t !== undefined && !t.isBookmarkInvalid) as Bookmark[];

		if (resolvedTargets.length === 0) return;

		let changed = false;
		const changedPaths = new Set<string>();
		undoManager.saveState(this.codeBookmarks, 'icon');
		
		for (const bookmark of resolvedTargets) {
			if (bookmark.icon !== '') {
				bookmark.icon = '';
				changed = true;
				changedPaths.add(fileUtils.relativeToAbsolute(bookmark.path));
			}
		}
		
		if (changed) {
			this.saveBookmarksToFile(Array.from(changedPaths));
			this.refreshDecoration();
		}
	}

	private _replaceBookmark(bookmark: Bookmark, skipSaveState: boolean = false) {
		const editor = vscode.window.activeTextEditor
		if (editor) {
			if (!skipSaveState) undoManager.saveState(this.codeBookmarks, 'move');
			bookmark.path = fileUtils.absoluteToRelative(editor.document.uri.fsPath)
			const startPosition = editor.selection.start;
			const endPosition = editor.selection.end;
			if (startPosition.isEqual(endPosition)) {
				bookmark.content = editor.document.lineAt(startPosition.line).text
			} else {
				bookmark.content = editor.document.getText(editor.selection)
			}
			bookmark.start = CursorIndex.from(startPosition)
			bookmark.end = CursorIndex.from(endPosition)
			bookmark.contextValue = ContextBookmark.Bookmark
			this.saveBookmarksToFile()
			this.refreshDecoration()
		}
	}

	private async _editLabel(bookmark: Bookmark, skipSaveState: boolean = false): Promise<boolean> {
		const newLabel = await vscode.window.showInputBox({ prompt: '编辑书签标签', value: `${bookmark.label}` })
		if (newLabel === undefined) return false
		if (newLabel.trim() === '') {
			logger.showWarningMessage('标签不能为空')
			return false
		}
		if (!skipSaveState) undoManager.saveState(this.codeBookmarks, 'move');
		bookmark.label = Helper.formatLabelSpacing(newLabel);
		this.saveBookmarksToFile([fileUtils.relativeToAbsolute(bookmark.path)])
		this.refreshDecoration()
		return true
	}

	private checkHasInvalidBookmarks(bookmarks: import('../models/BookmarkSet').BookmarkSet): boolean {
		for (const bm of bookmarks.values) {
			if (bm.contextValue === ContextBookmark.BookmarkInvalid) {
				return true;
			}
			if (bm.subs && bm.subs.size > 0) {
				if (this.checkHasInvalidBookmarks(bm.subs)) return true;
			}
		}
		return false;
	}

	public clearInvalidBookmarks() {
		let removedCount = 0;

		const recursiveFindInvalid = (bookmarks: import('../models/BookmarkSet').BookmarkSet) => {
			const toDelete: string[] = [];
			for (const bm of bookmarks.values) {
				if (bm.contextValue === ContextBookmark.BookmarkInvalid) {
					toDelete.push(bm.Id);
				} else if (bm.subs && bm.subs.size > 0) {
					toDelete.push(...recursiveFindInvalid(bm.subs));
				}
			}
			return toDelete;
		};

		const invalidIds = recursiveFindInvalid(this.codeBookmarks);
		
		if (invalidIds.length > 0) {
			undoManager.saveState(this.codeBookmarks, 'delete');
		}

		for (const id of invalidIds) {
			this.codeBookmarks.deleteBookmark(id);
			removedCount++;
		}

		if (removedCount > 0) {
			this.refreshDecoration();
			this.saveBookmarksToFile();
		}
	}

	async onDeleteBookmark(bm?: Bookmark, selectedBookmarks?: Bookmark[]) {
		let targets: Bookmark[] = [];
		if (selectedBookmarks && selectedBookmarks.length > 1) {
			targets = selectedBookmarks;
		} else if (this.treeView && this.treeView.selection.length > 1) {
			targets = [...this.treeView.selection];
		} else {
			const bookmark = bm || (this.treeView?.selection.length ? this.treeView.selection[0] : undefined);
			if (bookmark) targets.push(bookmark);
		}

		if (targets.length === 0) return;

		let hasAnySubs = false;
		for (const target of targets) {
			if (target.hasSub(this.codeBookmarks)) {
				hasAnySubs = true;
				break;
			}
		}

		let confirmMode = "是";
		if (hasAnySubs) {
			const promptMsg = targets.length > 1 ? `选中了 ${targets.length} 项，其中包含带子书签的文件夹，确定要删除吗？` : "确定要删除包含子书签的文件夹吗？";
			const confirm = await vscode.window.showInformationMessage(promptMsg, "是", "保留子书签，仅删除当前项", "否");
			if (!confirm || confirm === "否") return;
			confirmMode = confirm === "保留子书签，仅删除当前项" ? "保留" : "是";
		}

		let hasChanges = false;
		undoManager.saveState(this.codeBookmarks, 'delete');
		for (const target of targets) {
			if (target.hasSub(this.codeBookmarks)) {
				if (confirmMode === "保留") {
					if (this.moveChildrenToParentWhenDelete(target)) {
						hasChanges = true;
					}
				} else {
					this.deleteBookmarksData(target.Id);
					hasChanges = true;
				}
			} else {
				this.deleteBookmarksData(target.Id);
				hasChanges = true;
			}
		}

		if (hasChanges) {
			this.saveBookmarksToFile(targets.map(b => fileUtils.relativeToAbsolute(b.path)));
			this.refreshDecoration();
			if (targets.length > 1) {
				logger.showMessage(`成功删除了 ${targets.length} 个书签`);
			}
		}
	}

	onClickPinView(bookmark: Bookmark) {
		undoManager.saveState(this.codeBookmarks, 'status');
		const modified = this.codeBookmarks.pinBookmark(bookmark);
		for (const mod of modified) {
			this._onDidChangeTreeData.fire(mod);
		}
		if (bookmark.isOpened) {
			setTimeout(() => {
				this.expandFolderTreeView(bookmark);
			}, 50);
		}
	}

	onMoveUpLevel(bookmark: Bookmark) {
		const bm = this.codeBookmarks.findBookmark(bookmark);
		if (!bm) return;
		const parent = this.codeBookmarks.findParentBookmark(bm);
		if (!parent) {
			logger.showMessage('该书签已经在最顶层，无法继续向上移动。');
			return;
		}
		
		const grandparent = this.codeBookmarks.findParentBookmark(parent);
		
		undoManager.saveState(this.codeBookmarks, 'move');
		parent.subs.fastDelete(bm);
		
		if (grandparent) {
			grandparent.subs.add(bm);
			bm.parent = grandparent;
		} else {
			this.codeBookmarks.add(bm);
			bm.parent = undefined;
		}
		
		this.saveBookmarksToFile();
		this.refreshDecoration();
	}





	onMoveDirectory(oldPath: string, newPath: string) {
		undoManager.saveState(this.codeBookmarks, 'sync');
		this.codeBookmarks.renamePath(oldPath, newPath)
		this.saveBookmarksToFile()
		this.refreshDecoration()
	}

	onRenameDirectory(oldPath: string, newPath: string) {
		undoManager.saveState(this.codeBookmarks, 'sync');
		const relOld = fileUtils.absoluteToRelative(oldPath);
		const relNew = fileUtils.absoluteToRelative(newPath);
		this.codeBookmarks.renamePath(relOld, relNew)
		this.saveBookmarksToFile()
		this.refreshDecoration()
	}

	onDeleteDirectory(deletePath: string) {
		undoManager.saveState(this.codeBookmarks, 'sync');
		const relDel = fileUtils.absoluteToRelative(deletePath);
		const hasDelete = this.codeBookmarks.deleteWithPath(relDel)
		if (hasDelete) {
			this.saveBookmarksToFile()
			this.refreshDecoration()
		}
	}

	undo() {
		if (undoManager.undo(this.codeBookmarks)) {
			this.saveBookmarksToFile()
			this.refreshDecoration()
		} else {
			vscode.window.showInformationMessage("没有可以撤销的操作。");
		}
	}

	redo() {
		if (undoManager.redo(this.codeBookmarks)) {
			this.saveBookmarksToFile()
			this.refreshDecoration()
		} else {
			vscode.window.showInformationMessage("没有可以恢复的操作。");
		}
	}
}
