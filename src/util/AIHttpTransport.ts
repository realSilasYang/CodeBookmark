import * as http from 'http'
import * as https from 'https'
import { urlToHttpOptions } from 'url'
import * as vscode from 'vscode'
import { localize, UserCancelledError } from '../i18n/Localization'
import {
	AI_REQUEST_MAX_BYTES,
	AI_RESPONSE_MAX_BYTES,
	AI_RESPONSE_WARNING_BYTES,
} from './AIRequestPolicy'
import { aiErrorPreview } from './AIResponseCodec'
import { isJsonRecord } from './JsonRecord'

interface AIHttpRequest {
	url: URL
	headers: Record<string, string>
	payload: string
	timeoutS: number
	onProgress?: (message: string) => void
	token?: vscode.CancellationToken
}

export class AIHttpStatusError extends Error {
	constructor(
		readonly statusCode: number,
		readonly responsePreview: string,
		readonly requestUrl?: string,
		readonly serviceErrorCode?: string,
	) {
		super(localize(
			`AI 接口返回错误 [${statusCode}]${requestUrl ? `（${requestUrl}）` : ''}: ${responsePreview}`,
			`AI service returned an error [${statusCode}]${requestUrl ? ` (${requestUrl})` : ''}: ${responsePreview}`,
		))
		this.name = 'AIHttpStatusError'
	}
}

function serviceErrorCode(responseBody: string): string | undefined {
	try {
		const parsed: unknown = JSON.parse(responseBody)
		if (!isJsonRecord(parsed)) return undefined
		const nestedError = isJsonRecord(parsed.error) ? parsed.error : undefined
		const code = nestedError?.code ?? parsed.code
		return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined
	} catch {
		return undefined
	}
}

function formatByteSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
	return `${Math.ceil(bytes / 1024)} KiB`
}

function safeRequestUrl(url: URL): string {
	return `${url.origin}${url.pathname}`
}

export function postAIJson(request: AIHttpRequest): Promise<unknown> {
	const payloadBytes = Buffer.byteLength(request.payload)
	if (payloadBytes > AI_REQUEST_MAX_BYTES) {
		throw new Error(localize(
			`AI 请求大小为 ${formatByteSize(payloadBytes)}，超过 ${formatByteSize(AI_REQUEST_MAX_BYTES)} 的发送上限。`,
			`The AI request is ${formatByteSize(payloadBytes)}, which exceeds the ${formatByteSize(AI_REQUEST_MAX_BYTES)} send limit.`,
		))
	}

	const timeoutMs = request.timeoutS * 1000
	return new Promise((resolve, reject) => {
		let cancellationDisposable: vscode.Disposable | undefined
		let totalTimeout: NodeJS.Timeout | undefined
		let settled = false
		const finish = <T>(callback: (value: T) => void, value: T) => {
			if (settled) return
			settled = true
			if (totalTimeout) clearTimeout(totalTimeout)
			cancellationDisposable?.dispose()
			callback(value)
		}

		try {
			const requestModule = request.url.protocol === 'https:' ? https : http
			const clientRequest = requestModule.request({
				...urlToHttpOptions(request.url),
				method: 'POST',
				headers: {
					...request.headers,
					'Content-Length': payloadBytes,
				},
			}, response => {
				const chunks: Buffer[] = []
				let receivedBytes = 0
				let oversizedResponseApproved = false
				let responseApproval: Thenable<boolean> | undefined
				let isFirstChunk = true

				response.on('error', error => finish(reject, new Error(localize(`AI 响应接收失败: ${error.message}`, `Failed to receive the AI response: ${error.message}`))))
				response.on('aborted', () => finish(reject, new Error(localize('AI 响应在接收完成前被中断。', 'The AI response was interrupted before it was fully received.'))))
				const declaredLength = Number(response.headers['content-length'])
				if (Number.isFinite(declaredLength) && declaredLength > AI_RESPONSE_MAX_BYTES) {
					const error = new Error(localize(
						`AI 响应声明大小为 ${formatByteSize(declaredLength)}，超过 ${formatByteSize(AI_RESPONSE_MAX_BYTES)} 的接收上限。`,
						`The AI response declares a size of ${formatByteSize(declaredLength)}, above the ${formatByteSize(AI_RESPONSE_MAX_BYTES)} receive limit.`,
					))
					finish(reject, error)
					response.destroy(error)
					return
				}

				response.on('data', (chunk: Buffer) => {
					if (receivedBytes + chunk.length > AI_RESPONSE_MAX_BYTES) {
						const error = new Error(localize(
							`AI 响应超过 ${formatByteSize(AI_RESPONSE_MAX_BYTES)} 的接收上限。`,
							`The AI response exceeds the ${formatByteSize(AI_RESPONSE_MAX_BYTES)} receive limit.`,
						))
						finish(reject, error)
						response.destroy(error)
						return
					}
					receivedBytes += chunk.length
					if (isFirstChunk) {
						isFirstChunk = false
						request.onProgress?.(localize('已收到大模型首字节响应，正在持续接收数据流...', 'Received the first response byte. Continuing to receive data…'))
					}
					chunks.push(chunk)

					if (receivedBytes > AI_RESPONSE_WARNING_BYTES && !oversizedResponseApproved && !responseApproval) {
						response.pause()
						clientRequest.setTimeout(0)
						const actions = [
							{ title: localize('继续接收', 'Continue Receiving'), action: 'continue' as const },
							{ title: localize('取消', 'Cancel'), action: 'cancel' as const },
						]
						const approval = vscode.window.showWarningMessage(
							localize(
								`AI 响应已达到 ${formatByteSize(receivedBytes)}，超过 ${formatByteSize(AI_RESPONSE_WARNING_BYTES)} 提醒阈值，并且可能继续增长。继续接收会占用更多内存，且异常响应可能无法解析。`,
								`The AI response has reached ${formatByteSize(receivedBytes)}, above the ${formatByteSize(AI_RESPONSE_WARNING_BYTES)} warning threshold, and may continue growing. Continuing uses more memory, and an abnormal response may not be parseable.`,
							),
							{ modal: true },
							...actions,
						).then(choice => choice?.action === 'continue')
						responseApproval = approval

						void approval.then(approved => {
							if (settled) return
							if (approved) {
								oversizedResponseApproved = true
								clientRequest.setTimeout(timeoutMs)
								response.resume()
								return
							}
							const error = new UserCancelledError(
								'用户主动取消了超大 AI 响应接收',
								'The user cancelled receiving the oversized AI response.',
							)
							finish(reject, error)
							response.destroy(error)
						}, error => {
							finish(reject, error instanceof Error ? error : new Error(String(error)))
							response.destroy(error)
						})
					}
				})

				response.on('end', () => {
					void (async () => {
						if (responseApproval && !await responseApproval) return
						const data = Buffer.concat(chunks).toString('utf8')
						if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
							try {
								finish(resolve, JSON.parse(data) as unknown)
							} catch {
								finish(reject, new Error(localize('无法解析 AI 响应数据', 'Unable to parse the AI response data.')))
							}
							return
						}
						finish(reject, new AIHttpStatusError(
							response.statusCode ?? 0,
							aiErrorPreview(data),
							safeRequestUrl(request.url),
							serviceErrorCode(data),
						))
					})().catch(error => finish(reject, error instanceof Error ? error : new Error(String(error))))
				})
			})

			clientRequest.on('error', error => finish(reject, error instanceof UserCancelledError
				? error
				: new Error(localize(`网络请求失败: ${error.message}`, `Network request failed: ${error.message}`))))
			if (request.token) {
				cancellationDisposable = request.token.onCancellationRequested(() => {
					clientRequest.destroy(new UserCancelledError('用户主动取消了 AI 任务', 'The user cancelled the AI task.'))
				})
				if (request.token.isCancellationRequested) {
					clientRequest.destroy(new UserCancelledError('用户主动取消了 AI 任务', 'The user cancelled the AI task.'))
				}
			}

			clientRequest.setTimeout(timeoutMs, () => {
				clientRequest.destroy(new Error(localize(`AI 请求超时（${request.timeoutS} 秒）`, `The AI request timed out after ${request.timeoutS} seconds.`)))
			})
			totalTimeout = setTimeout(() => {
				clientRequest.destroy(new Error(localize(`AI 请求总时长超过 ${request.timeoutS} 秒`, `The AI request exceeded ${request.timeoutS} seconds in total.`)))
			}, timeoutMs)

			request.onProgress?.(localize(
				'正在发起网络连接，等待大模型推理响应（这可能需要几秒到十几秒）……',
				'Connecting and waiting for the AI response (this may take several seconds)…',
			))
			clientRequest.write(request.payload)
			clientRequest.end()
		} catch (error) {
			finish(reject, new Error(localize(
				`请求构建失败: ${error instanceof Error ? error.message : String(error)}`,
				`Failed to construct the request: ${error instanceof Error ? error.message : String(error)}`,
			)))
		}
	})
}
