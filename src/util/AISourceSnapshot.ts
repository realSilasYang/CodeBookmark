/**
 * 读取 AI 请求使用的文档版本、文件状态与源码内容，并在提交结果前验证快照仍然新鲜。
 * 打开文档以版本号为准，磁盘文件以统计信息为准；任一变化都会阻止过期 AI 结果落盘。
 */
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
		throw new Error(localize("util.AISourceSnapshot.theFileAppearsToContainBinaryDataSoAi"))
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
	if (!before.isFile()) throw new Error(localize("util.AISourceSnapshot.thePathIsNotARegularFile"))
	await AIService.confirmSourceSize(before.size, filePath)
	const content = await fs.promises.readFile(filePath, 'utf8')
	assertNotBinary(content)
	const actualBytes = aiContentByteLength(content)
	if (actualBytes > before.size) await AIService.confirmSourceSize(actualBytes, filePath)
	else AIService.assertSourceSize(actualBytes, filePath)
	const after = await fs.promises.stat(filePath)
	if (!after.isFile() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
		throw new Error(localize("util.AISourceSnapshot.theFileChangedWhileItsSourceWasBeingRead"))
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
		throw new Error(localize("util.AISourceSnapshot.theSourceFileChangedDuringAiAnalysisRunThe"))
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
		throw new Error(localize("util.AISourceSnapshot.theSourceFileChangedDuringAiAnalysisRunThe"))
	}
}
