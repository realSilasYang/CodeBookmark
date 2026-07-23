import * as path from 'path'
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import type { Bookmark } from '../models/Bookmark'
import { fileUtils } from '../util/FileUtils'
import { visitAISourceFilesInFolder } from '../util/AISourceFolderScanner'
import {
	AIFolderPresenceCache,
	bookmarkPathPresenceSignature,
	type AIFolderBookmarkPresence,
} from './AIFolderPresenceCache'
import {
	runGenerateBookmarksForFolder,
	runOptimizeBookmarksForFolder,
	type AIFolderWorkflowPort,
	type AIFolderWorkflowTarget,
} from './AIFolderWorkflowRunner'
import type { AIGenerationMode } from './AISingleFileWorkflowRunner'

interface AIWorkflowControllerPort {
	bookmarkRoots(): readonly Bookmark[]
	bookmarksForPath(path: string): readonly Bookmark[]
	ensureEditorScope(editor: vscode.TextEditor): Promise<void>
	workspaceFolderRootForCurrentScope(): string | undefined
	storageScopeForUri(uri: vscode.Uri): string
	refreshScope(storageScope: string): Promise<void>
	folderWorkflowPort(): AIFolderWorkflowPort
}

export class AIWorkflowController {
	private readonly folderPresenceCache = new AIFolderPresenceCache()

	constructor(private readonly port: AIWorkflowControllerPort) {}

	invalidateSourceFiles(): void {
		this.folderPresenceCache.invalidateSourceFiles()
	}

	async folderBookmarkPresence(directory: string): Promise<AIFolderBookmarkPresence> {
		return this.folderPresenceCache.getPresence(
			directory,
			bookmarkPathPresenceSignature(this.port.bookmarkRoots()),
			async () => {
				const presence = {
					hasBookmarkedScript: false,
					hasUnbookmarkedScript: false,
				}
				await visitAISourceFilesInFolder(directory, filePath => {
					const relativePath = fileUtils.absoluteToRelative(filePath)
					if (this.port.bookmarksForPath(relativePath).length === 0) {
						presence.hasUnbookmarkedScript = true
					} else {
						presence.hasBookmarkedScript = true
					}
					return presence.hasBookmarkedScript && presence.hasUnbookmarkedScript
				})
				return presence
			},
		)
	}

	async generateFolder(mode: AIGenerationMode): Promise<void> {
		await runGenerateBookmarksForFolder(
			await this.folderWorkflowTarget(),
			mode,
			this.port.folderWorkflowPort(),
		)
	}

	async optimizeFolder(): Promise<void> {
		await runOptimizeBookmarksForFolder(
			await this.folderWorkflowTarget(),
			this.port.folderWorkflowPort(),
		)
	}

	private async folderWorkflowTarget(): Promise<AIFolderWorkflowTarget> {
		const editor = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
			? vscode.window.activeTextEditor
			: undefined
		if (editor) {
			await this.port.ensureEditorScope(editor)
			return {
				directory: path.dirname(editor.document.uri.fsPath),
				storageScope: this.port.storageScopeForUri(editor.document.uri),
			}
		}

		const directory = this.port.workspaceFolderRootForCurrentScope()
		if (!directory) throw new Error(localize('请先打开文件夹或工作区。', 'Open a folder or workspace first.'))
		const storageScope = this.port.storageScopeForUri(vscode.Uri.file(directory))
		await this.port.refreshScope(storageScope)
		return { directory, storageScope }
	}
}
