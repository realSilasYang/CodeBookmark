/**
 * 统一 VS Code 文本文档的只读查询，供扫描、AI 与书签视图共同使用。
 * 这里明确区分本地 file 文档与虚拟文档，路径匹配和逐行提取不再由调用方各自猜测。
 */
import * as vscode from 'vscode'
import { normalizedAbsolutePath } from './AbsolutePath'

export function textDocumentLines(document: vscode.TextDocument): string[] {
	return Array.from({ length: document.lineCount }, (_, line) => document.lineAt(line).text)
}

export function findOpenFileDocument(filePath: string): vscode.TextDocument | undefined {
	const normalizedPath = normalizedAbsolutePath(filePath)
	return vscode.workspace.textDocuments.find(document => document.uri.scheme === 'file'
		&& normalizedAbsolutePath(document.uri.fsPath) === normalizedPath)
}

export function activeFileUri(): vscode.Uri | undefined {
	const uri = vscode.window.activeTextEditor?.document.uri
	return uri?.scheme === 'file' ? uri : undefined
}
