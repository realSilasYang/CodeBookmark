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
} from './AIBookmarkSchema';
import { resolveAIRequestTargets } from './AIEndpointResolver'
import { decodeAIProtocolResponse, encodeAIProtocolRequest, type AIMessage } from './AIProtocolCodec'
import { AIHttpStatusError, postAIJson } from './AIHttpTransport'
import { parseAIJsonReply } from './AIResponseCodec'
import { assertAIWorkspaceTrusted } from './WorkspaceCapabilityPolicy'

export type { AIBookmark } from './AIBookmarkSchema';
export { AIHttpStatusError } from './AIHttpTransport'

interface ExistingBookmark {
	id: string
	label?: string | vscode.TreeItemLabel
	content?: string
	start?: { line: number }
	isUsingDefaultIcon?: boolean
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

function formatByteSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
	return `${Math.ceil(bytes / 1024)} KiB`
}

export class AIService {
	private static approvedInsecureEndpoints = new Set<string>();

	public static assertSourceSize(bytes: number, filePath: string): void {
		if (!Number.isSafeInteger(bytes) || bytes < 0) {
			throw new Error(localize("util.AIService.unableToDetermineTheAiSourceSize"))
		}
		if (bytes > AI_SOURCE_MAX_BYTES) {
			throw new Error(localize("util.AIService.theScriptIsWhichExceedsTheAiProcessingLimit", { fileName: path.basename(filePath), formatByteSize: formatByteSize(bytes), formatByteSize2: formatByteSize(AI_SOURCE_MAX_BYTES) }))
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
			localize("util.AIService.theSourceOfIsAboveTheWarningThresholdContinuing", { fileName: path.basename(filePath), formatByteSize: formatByteSize(bytes), formatByteSize2: formatByteSize(AI_SOURCE_WARNING_BYTES) }),
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
		return `${basePrompt}\n\n${contract}`
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
		const timeoutS = ExtensionConfig.aiTimeoutS;

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
					timeoutS,
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
	public static async generateBookmarks(codeContent: string, filePath: string, onProgress?: (msg: string) => void, token?: vscode.CancellationToken): Promise<AIBookmark[]> {
		onProgress?.(localize("util.AIService.collectingSourceAndFileContext"));
		const prompt = this.generationPrompt();
		const numberedSource = formatLineNumberedSource(codeContent);
		const fileType = path.extname(filePath).toLowerCase() || localize('common.unknown')

		const messages = [
			{ role: 'system', content: prompt },
			{
				role: 'user',
				content: localize("util.AIService.analyzeThisFileAndProposeSemanticCodeBookmarksThe", {
					fileName: path.basename(filePath),
					fileType,
					numberedSource,
				})
			}
		];

		const response = await this.sendRequest(messages, onProgress, token);
		
		onProgress?.(localize("util.AIService.parsingAndValidatingTheAiBookmarkStructure"));

		try {
			return normalizeAIBookmarkPayload(parseAIJsonReply(response, '{'));
		} catch (error) {
			logger.error(localize("util.AIService.failedToParseTheAiBookmarkResponse", { error }));
			throw new Error(localize("util.AIService.aiDidNotReturnValidBookmarkJsonCheckThe"), { cause: error });
		}
	}

	/** 请求模型优化已有标签或图标；书签 ID 和树结构仍由本地数据掌握，模型不能改动。 */
	public static async optimizeBookmarks(codeContent: string, filePath: string, existingBookmarks: ExistingBookmark[], onProgress?: (msg: string) => void, token?: vscode.CancellationToken): Promise<AIOptimizedBookmark[]> {
		onProgress?.(localize("util.AIService.collectingSourceAndExistingBookmarkContext"));
		if (existingBookmarks.length === 0) return []
		const prompt = this.optimizationPrompt();
		const numberedSource = formatLineNumberedSource(codeContent);
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
			const bookmarksJson = JSON.stringify(batch.map(b => ({
				id: b.id,
				label: labelText(b.label),
				lineNumber: (b.start?.line ?? 0) + 1,
				anchor: (b.content ?? '').replace(/\s+/g, ' ').slice(0, MAX_BOOKMARK_ANCHOR_LENGTH),
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
				const semanticContextById = new Map(batch.map(bookmark => [bookmark.id, {
					label: labelText(bookmark.label),
					anchor: bookmark.content ?? '',
					canAssignIcon: bookmark.isUsingDefaultIcon !== false,
				}]))
				optimized.push(...normalizeAIOptimizedBookmarks(parsed, semanticContextById))
			} catch (error) {
				logger.error(localize("util.AIService.failedToParseTheAiLabelResponse", { error }))
				throw new Error(localize("util.AIService.aiBatchDidNotReturnValidLabelUpdateJson", { batchNumber, batchCount }), { cause: error })
			}
		}
		return optimized
	}
}
