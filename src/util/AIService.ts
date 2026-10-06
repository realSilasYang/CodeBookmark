/**
 * 统筹 AI 请求目标、协议编码、传输、回退与结果解析，为生成和优化提供统一服务。
 * 只在可判定的协议不兼容时尝试下一目标；认证、限流和取消错误会保留原意交给界面提示。
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { localize, UserCancelledError } from '../i18n/Localization'
import { logger } from './Logger';
import {
	AI_SOURCE_MAX_BYTES,
	AI_SOURCE_WARNING_BYTES,
	isRemoteHttpEndpoint,
} from './AIRequestPolicy';
import {
	type AIBookmark,
	type AIOptimizedBookmark,
	formatLineNumberedSource,
	normalizeAIBookmarkPayload,
	normalizeAIOptimizedBookmarks,
	resolveAIBookmarkLine,
} from './AIBookmarkSchema';
import { filterAIBookmarksToRange, splitAIGenerationChunks } from './AIGenerationChunks'
import { buildAIIconSourceContext } from './AIIconCatalog'
import { resolveAIRequestTargets } from './AIEndpointResolver'
import { decodeAIProtocolResponse, encodeAIProtocolRequest, type AIMessage } from './AIProtocolCodec'
import { AIHttpStatusError, postAIJson } from './AIHttpTransport'
import { parseAIJsonReply } from './AIResponseCodec'
import { assertAIWorkspaceTrusted } from './WorkspaceCapabilityPolicy'
import { formatBinaryByteSize } from './ByteSize'

export type { AIBookmark } from './AIBookmarkSchema';
export { AIHttpStatusError } from './AIHttpTransport'

interface ExistingBookmark {
	id: string
	label?: string | vscode.TreeItemLabel
	content?: string
	start?: { line: number }
	isUsingDefaultIcon?: boolean
}

interface ExistingGenerationBookmark extends ExistingBookmark {
	start: { line: number }
	parent?: { id: string }
	isFile?: boolean
	isCodeMarker?: boolean
	isBookmarkInvalid?: boolean
}

const MAX_BOOKMARK_ANCHOR_LENGTH = 1000
const MAX_AI_OPTIMIZATION_BATCH = 300

export function isAIAuthenticationError(error: unknown): boolean {
	return error instanceof AIHttpStatusError && (error.statusCode === 401 || error.statusCode === 403)
}

export function isAIRateLimitError(error: unknown): boolean {
	return error instanceof AIHttpStatusError && error.statusCode === 429
}

function isUnavailableRouteError(error: unknown): error is AIHttpStatusError {
	if (!(error instanceof AIHttpStatusError)) return false
	if (error.statusCode === 405) return true
	if (error.statusCode !== 404) return false

	const code = error.serviceErrorCode?.toLowerCase() ?? ''
	if (/(?:deployment|model|resource)/.test(code)) return false
	if (code && /(?:route|path|endpoint|^404$)/.test(code)) return true
	if (code) return false

	const preview = error.responsePreview.toLowerCase()
	if (/(?:deployment|model|resource).*(?:not found|does not exist|missing)/.test(preview)) return false
	return /cannot\s+post/.test(preview)
		|| /(?:route|path|endpoint|url).*(?:not found|missing|unavailable|invalid)/.test(preview)
		|| /(?:not found|missing|unavailable|invalid).*(?:route|path|endpoint|url)/.test(preview)
		|| /["':\s]not found["'}\s]/.test(preview)
}

function labelText(label: string | vscode.TreeItemLabel | undefined): string {
	return typeof label === 'string' ? label : label?.label ?? ''
}

function mergeGeneratedBookmarks(
	bookmarks: readonly AIBookmark[],
	lines: string[],
): AIBookmark[] {
	const bookmarksByLine = new Map<number, AIBookmark>()

	const mergeItems = (items: readonly AIBookmark[]): AIBookmark[] => {
		const merged: AIBookmark[] = []
		for (const bookmark of items) {
			const line = resolveAIBookmarkLine(lines, bookmark)
			if (line === undefined) {
				merged.push(...mergeItems(bookmark.subs))
				continue
			}
			const existing = bookmarksByLine.get(line)
			if (existing) {
				existing.subs.push(...mergeItems(bookmark.subs))
				existing.subs.sort((left, right) => (left.line ?? 0) - (right.line ?? 0))
				continue
			}
			const node = { ...bookmark, line, subs: [] as AIBookmark[] }
			bookmarksByLine.set(line, node)
			node.subs.push(...mergeItems(bookmark.subs))
			node.subs.sort((left, right) => (left.line ?? 0) - (right.line ?? 0))
			merged.push(node)
		}
		return merged.sort((left, right) => (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER))
	}

	return mergeItems(bookmarks)
}

export class AIService {
	private static approvedInsecureEndpoints = new Set<string>();

	public static assertSourceSize(bytes: number, filePath: string): void {
		if (!Number.isSafeInteger(bytes) || bytes < 0) {
			throw new Error(localize("util.AIService.unableToDetermineTheAiSourceSize"))
		}
		if (bytes > AI_SOURCE_MAX_BYTES) {
			throw new Error(localize("util.AIService.theScriptIsWhichExceedsTheAiProcessingLimit", { fileName: path.basename(filePath), formatByteSize: formatBinaryByteSize(bytes), formatByteSize2: formatBinaryByteSize(AI_SOURCE_MAX_BYTES) }))
		}
	}

	public static async confirmSourceSize(bytes: number, filePath: string): Promise<void> {
		this.assertSourceSize(bytes, filePath)
		if (bytes <= AI_SOURCE_WARNING_BYTES) return

		const actions = [
			{ title: localize("util.AIService.sendAnyway"), action: 'continue' as const },
			{ title: localize("util.AIService.cancel"), action: 'cancel' as const },
		]
		const choice = await vscode.window.showWarningMessage(
			localize("util.AIService.theSourceOfIsAboveTheWarningThresholdContinuing", { fileName: path.basename(filePath), formatByteSize: formatBinaryByteSize(bytes), formatByteSize2: formatBinaryByteSize(AI_SOURCE_WARNING_BYTES) }),
			{ modal: true },
			...actions,
		)
		if (choice?.action !== 'continue') {
			throw new UserCancelledError("util.AIService.theUserCancelledTheAiRequestForTheOversized")
		}
	}

	private static generationPrompt(): string {
		const configured = ExtensionConfig.aiPrompt.trim()
		const basePrompt = configured || localize("ai.prompt.generation")
		const contract = localize("ai.prompt.generationContract")
		const coverageGuidance = 'For complete coverage, inspect the supplied source from the first displayed line to the last. Treat every distinct comment that clearly names a module, section, phase, responsibility, or workflow boundary as a first-class bookmark candidate; preserve its structural meaning and do not stop after the first few functions. Use nearby code to validate the heading, and avoid omitting a meaningful structural comment merely because it is not attached to a function declaration.'
		return `${basePrompt}\n\n${contract}\n\n${coverageGuidance}`
	}

	private static optimizationPrompt(): string {
		const configured = ExtensionConfig.aiOptimizePrompt.trim()
		const basePrompt = configured || localize("ai.prompt.optimization")
		const contract = localize("ai.prompt.optimizationContract")
		return `${basePrompt}\n\n${contract}`
	}

	private static async sendRequestWithTarget(
		messages: AIMessage[],
		onProgress?: (msg: string) => void,
		token?: vscode.CancellationToken,
	): Promise<{ content: string; address: string }> {
		assertAIWorkspaceTrusted()
		onProgress?.(localize("util.AIService.preparingTheAiNetworkRequest"));
		const address = ExtensionConfig.aiAddress;
		const apiKey = ExtensionConfig.aiAPIKey;
		const model = ExtensionConfig.aiModel;

		if (!address) throw new Error(localize("util.AIService.theAiServiceAddressIsNotConfigured"))
		if (!model) throw new Error(localize("util.AIService.theAiModelNameIsNotConfigured"))

		const targets = resolveAIRequestTargets(address, model)
		const approvalKey = targets[0].url.origin
		if (isRemoteHttpEndpoint(targets[0].url.toString()) && !this.approvedInsecureEndpoints.has(approvalKey)) {
			const actions = [
				{ title: localize("util.AIService.continueAnyway"), action: 'continue' as const },
				{ title: localize("util.AIService.cancel"), action: 'cancel' as const },
			];
			const choice = await vscode.window.showWarningMessage(
				localize("util.AIService.thisRemoteAiServiceUsesHttpSoSourceCode"),
				{ modal: true },
				...actions,
			);
			if (choice?.action !== 'continue') {
				throw new UserCancelledError("util.AIService.theInsecureAiRequestWasCancelled");
			}
			this.approvedInsecureEndpoints.add(approvalKey);
		}

		let lastError: unknown
		for (const [index, target] of targets.entries()) {
			if (token?.isCancellationRequested) {
				throw new UserCancelledError("util.AIService.theUserCancelledTheAiTask")
			}
			const encoded = encodeAIProtocolRequest(target, messages, model, apiKey)
			try {
				const response = await postAIJson({
					url: target.url,
					headers: encoded.headers,
					payload: encoded.payload,
					onProgress,
					token,
				})
				const content = decodeAIProtocolResponse(target.protocol, response)
				if (!content.trim()) {
					throw new Error(localize("util.AIService.theAiResponseDidNotContainUsableTextProtocol", { protocol: target.protocol }))
				}
				return { content, address: target.url.toString() }
			} catch (error) {
				lastError = error
				const canTryNext = isUnavailableRouteError(error)
					&& index + 1 < targets.length
				if (!canTryNext) throw error
				onProgress?.(localize("util.AIService.theCurrentApiPathIsUnavailableTryingAnotherCompatible"))
			}
		}
		throw lastError instanceof Error ? lastError : new Error(localize("util.AIService.noUsableAiServiceAddressWasFound"))
	}

	private static async sendRequest(
		messages: AIMessage[],
		onProgress?: (msg: string) => void,
		token?: vscode.CancellationToken,
	): Promise<string> {
		return (await this.sendRequestWithTarget(messages, onProgress, token)).content
	}

	/** 用一条最小请求走完整协议链，确认当前地址、模型和密钥确实可以得到模型回复。 */
	public static async testConnection(): Promise<string> {
		try {
			const result = await this.sendRequestWithTarget([
				{ role: 'user', content: 'hello' }
			]);
			return result.address;
		} catch (error) {
			logger.error(error);
			throw error;
		}
	}

	/** 把源码和生成提示交给模型，再将回复校验成可定位、可构建层级的书签数据。 */
	public static async generateBookmarks(
		codeContent: string,
		filePath: string,
		onProgress?: (msg: string) => void,
		token?: vscode.CancellationToken,
		existingBookmarks: readonly ExistingGenerationBookmark[] = [],
	): Promise<AIBookmark[]> {
		onProgress?.(localize("util.AIService.collectingSourceAndFileContext"));
		const sourceLines = codeContent.split(/\r\n|\n|\r/)
		const existing = existingBookmarks.filter(bookmark => !bookmark.isFile && !bookmark.isCodeMarker
			&& !bookmark.isBookmarkInvalid && Number.isSafeInteger(bookmark.start?.line)
			&& bookmark.start.line >= 0 && bookmark.start.line < sourceLines.length)
		const existingById = new Map(existing.map(bookmark => [bookmark.id, bookmark]))
		const existingStructure = existing.map(bookmark => {
			const parent = bookmark.parent ? existingById.get(bookmark.parent.id) : undefined
			return {
				label: labelText(bookmark.label),
				lineNumber: bookmark.start.line + 1,
				anchor: sourceLines[bookmark.start.line],
				parentLineNumber: parent ? parent.start.line + 1 : null,
			}
		})
		const existingParentLines = new Set(existing.map(bookmark => bookmark.start.line))
		const prompt = this.generationPrompt() + (existing.length > 0 ? `\n\n${localize('ai.prompt.appendGeneration')}` : '')
		const generationChunks = splitAIGenerationChunks(codeContent)
		const fileType = path.extname(filePath).toLowerCase() || localize('common.unknown')
		const generated: AIBookmark[] = []

		for (let index = 0; index < generationChunks.length; index++) {
			if (token?.isCancellationRequested) {
				throw new UserCancelledError("util.AIService.theUserCancelledTheAiTask")
			}
			const chunk = generationChunks[index]
			if (generationChunks.length > 1) {
				onProgress?.(`${localize("util.AIService.collectingSourceAndFileContext")} (${index + 1}/${generationChunks.length})`)
			}
			const scopeInstruction = generationChunks.length > 1
				? `\n\nThis is analysis segment ${index + 1} of ${generationChunks.length}. The displayed lines may include surrounding context from adjacent segments. Inspect the entire segment in source order, especially every clear module, section, phase, or structural comment. Return new bookmarks only for responsible source lines ${chunk.startLine + 1}-${chunk.endLine}; context lines outside that range are reference only and must not produce new bookmarks. Existing bookmarks outside that range may be returned only as containers for new children, using their provided lineNumber and anchor.`
				: ''
			const messages = [
				{ role: 'system', content: prompt },
				{
					role: 'user',
					content: localize("util.AIService.analyzeThisFileAndProposeSemanticCodeBookmarksThe", {
						fileName: path.basename(filePath),
						fileType,
						numberedSource: chunk.numberedSource,
					}) + scopeInstruction + (existing.length > 0 ? `\n\n${JSON.stringify({ existingBookmarks: existingStructure })}` : ''),
				}
			]

			const response = await this.sendRequest(messages, onProgress, token);
			try {
				const parsed = normalizeAIBookmarkPayload(parseAIJsonReply(response, '{'), sourceLines)
				const inResponsibleRange = filterAIBookmarksToRange(
					parsed,
					bookmark => resolveAIBookmarkLine(sourceLines, bookmark),
					chunk.startLine,
					chunk.endLine,
					existingParentLines,
				)
				generated.push(...inResponsibleRange)
			} catch (error) {
				logger.error(localize("util.AIService.failedToParseTheAiBookmarkResponse", { error }))
				throw new Error(localize("util.AIService.aiDidNotReturnValidBookmarkJsonCheckThe"), { cause: error })
			}
		}

		onProgress?.(localize("util.AIService.parsingAndValidatingTheAiBookmarkStructure"));
		return mergeGeneratedBookmarks(generated, sourceLines)
	}

	/** 请求模型优化已有标签或图标；书签 ID 和树结构仍由本地数据掌握，模型不能改动。 */
	public static async optimizeBookmarks(codeContent: string, filePath: string, existingBookmarks: ExistingBookmark[], onProgress?: (msg: string) => void, token?: vscode.CancellationToken): Promise<AIOptimizedBookmark[]> {
		onProgress?.(localize("util.AIService.collectingSourceAndExistingBookmarkContext"));
		if (existingBookmarks.length === 0) return []
		const prompt = this.optimizationPrompt();
		const numberedSource = formatLineNumberedSource(codeContent);
		const sourceLines = codeContent.split(/\r\n|\n|\r/)
		const fileType = path.extname(filePath).toLowerCase() || localize('common.unknown')
		const optimized: AIOptimizedBookmark[] = []
		const batchCount = Math.ceil(existingBookmarks.length / MAX_AI_OPTIMIZATION_BATCH)
		for (let start = 0; start < existingBookmarks.length; start += MAX_AI_OPTIMIZATION_BATCH) {
			if (token?.isCancellationRequested) {
				throw new UserCancelledError("util.AIService.theUserCancelledTheAiTask")
			}
			const batch = existingBookmarks.slice(start, start + MAX_AI_OPTIMIZATION_BATCH)
			const batchNumber = Math.floor(start / MAX_AI_OPTIMIZATION_BATCH) + 1
			if (batchCount > 1) onProgress?.(localize("util.AIService.improvingBookmarkBatch", { batchNumber, batchCount }))
			const semanticContextById = new Map(batch.map(bookmark => {
				const line = resolveAIBookmarkLine(sourceLines, {
					label: labelText(bookmark.label), line: bookmark.start?.line, content: bookmark.content ?? '', subs: [],
				})
				return [bookmark.id, {
					label: labelText(bookmark.label),
					anchor: line === undefined ? bookmark.content ?? '' : sourceLines[line],
					sourceContext: buildAIIconSourceContext(sourceLines, line),
					canAssignIcon: bookmark.isUsingDefaultIcon !== false,
				}]
			}))
			const bookmarksJson = JSON.stringify(batch.map(b => ({
				id: b.id,
				label: labelText(b.label),
				lineNumber: (b.start?.line ?? 0) + 1,
				anchor: semanticContextById.get(b.id)!.anchor.slice(0, MAX_BOOKMARK_ANCHOR_LENGTH),
				sourceContext: semanticContextById.get(b.id)!.sourceContext,
				canAssignIcon: b.isUsingDefaultIcon !== false,
			})))
			const messages = [
				{ role: 'system', content: prompt },
				{ role: 'user', content: localize("util.AIService.improveTheFollowingBookmarksAndChooseAnIconOnly", {
					fileName: path.basename(filePath),
					fileType,
					numberedSource,
					bookmarksJson,
				}) },
			]
			const response = await this.sendRequest(messages, onProgress, token)
			onProgress?.(localize("util.AIService.parsingAndValidatingTheAiImprovements"))
			try {
				const parsed = parseAIJsonReply(response, '[')
				optimized.push(...normalizeAIOptimizedBookmarks(parsed, semanticContextById))
			} catch (error) {
				logger.error(localize("util.AIService.failedToParseTheAiLabelResponse", { error }))
				throw new Error(localize("util.AIService.aiBatchDidNotReturnValidLabelUpdateJson", { batchNumber, batchCount }), { cause: error })
			}
		}
		return optimized
	}
}
