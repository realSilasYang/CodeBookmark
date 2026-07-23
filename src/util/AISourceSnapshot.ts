import fs = require('fs')
import { localize } from '../i18n/Localization'
import { aiContentByteLength } from './AIRequestPolicy'
import { AIService } from './AIService'
import { normalizedAbsolutePath } from './AbsolutePath'

interface AISourceDocument {
	readonly uri: { fsPath: string }
	readonly version: number
	getText(): string
}

export type AIFileSnapshot = {
	kind: 'document'
	content: string
	document: AISourceDocument
	version: number
} | {
	kind: 'disk'
	content: string
	size: number
	mtimeMs: number
	ctimeMs: number
}

function assertNotBinary(content: string): void {
	if (content.slice(0, 64 * 1024).includes('\0')) {
		throw new Error(localize('文件疑似为二进制内容，已跳过 AI 分析', 'The file appears to contain binary data, so AI analysis was skipped.'))
	}
}

export async function readAISourceSnapshot(
	filePath: string,
	findOpenDocument: (candidatePath: string) => AISourceDocument | undefined,
): Promise<AIFileSnapshot> {
	const openDocument = findOpenDocument(filePath)
	if (openDocument) {
		const content = openDocument.getText()
		const bytes = aiContentByteLength(content)
		await AIService.confirmSourceSize(bytes, filePath)
		assertNotBinary(content)
		return { kind: 'document', content, document: openDocument, version: openDocument.version }
	}

	const before = await fs.promises.stat(filePath)
	if (!before.isFile()) throw new Error(localize('路径不是普通文件', 'The path is not a regular file.'))
	await AIService.confirmSourceSize(before.size, filePath)
	const content = await fs.promises.readFile(filePath, 'utf8')
	assertNotBinary(content)
	const actualBytes = aiContentByteLength(content)
	if (actualBytes > before.size) await AIService.confirmSourceSize(actualBytes, filePath)
	else AIService.assertSourceSize(actualBytes, filePath)
	const after = await fs.promises.stat(filePath)
	if (!after.isFile() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
		throw new Error(localize('读取 AI 源码期间文件发生变化，请重新运行。', 'The file changed while its source was being read for AI. Run the command again.'))
	}
	return { kind: 'disk', content, size: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs }
}

export function assertAIDocumentSnapshot(
	document: AISourceDocument,
	version: number,
	content: string,
	sourcePath: string,
): void {
	if (document.version !== version || document.getText() !== content
		|| normalizedAbsolutePath(document.uri.fsPath) !== normalizedAbsolutePath(sourcePath)
		|| !fs.existsSync(sourcePath)) {
		throw new Error(localize('AI 分析期间源文件发生变化，请基于最新内容重新运行。', 'The source file changed during AI analysis. Run the command again using the latest content.'))
	}
}

export async function assertAISourceSnapshot(filePath: string, snapshot: AIFileSnapshot): Promise<void> {
	if (snapshot.kind === 'document') {
		assertAIDocumentSnapshot(snapshot.document, snapshot.version, snapshot.content, filePath)
		return
	}
	const stat = await fs.promises.stat(filePath)
	if (stat.isFile() && stat.size === snapshot.size
		&& stat.mtimeMs === snapshot.mtimeMs && stat.ctimeMs === snapshot.ctimeMs) return
	if (!stat.isFile() || await fs.promises.readFile(filePath, 'utf8') !== snapshot.content) {
		throw new Error(localize('AI 分析期间源文件发生变化，请基于最新内容重新运行。', 'The source file changed during AI analysis. Run the command again using the latest content.'))
	}
}
