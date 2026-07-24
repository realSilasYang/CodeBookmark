/**
 * 发送带超时和取消信号的 JSON POST，请求完成前限制响应体大小并统一转换 HTTP 错误。
 * 传输层不解释模型业务字段，只保证网络状态、编码和资源上限对上层可预测。
 */
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

function localizedRequestAddress(requestUrl: string | undefined): string {
	return requestUrl ? localize('util.AIHttpTransport.requestAddress', { requestUrl }) : ''
}

export class AIHttpStatusError extends Error {
	constructor(
		readonly statusCode: number,
		readonly responsePreview: string,
		readonly requestUrl?: string,
		readonly serviceErrorCode?: string,
	) {
		super(localize("util.AIHttpTransport.aiServiceReturnedAnError", {
			statusCode,
			requestAddress: localizedRequestAddress(requestUrl),
			responsePreview,
		}))
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
		throw new Error(localize("util.AIHttpTransport.theAiRequestIsWhichExceedsTheSendLimit", { formatByteSize: formatByteSize(payloadBytes), formatByteSize2: formatByteSize(AI_REQUEST_MAX_BYTES) }))
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

				response.on('error', error => finish(reject, new Error(localize("util.AIHttpTransport.failedToReceiveTheAiResponse", { message: error.message }))))
				response.on('aborted', () => finish(reject, new Error(localize("util.AIHttpTransport.theAiResponseWasInterruptedBeforeItWasFully"))))
				const declaredLength = Number(response.headers['content-length'])
				if (Number.isFinite(declaredLength) && declaredLength > AI_RESPONSE_MAX_BYTES) {
					const error = new Error(localize("util.AIHttpTransport.theAiResponseDeclaresASizeOfAboveThe", { formatByteSize: formatByteSize(declaredLength), formatByteSize2: formatByteSize(AI_RESPONSE_MAX_BYTES) }))
					finish(reject, error)
					response.destroy(error)
					return
				}

				response.on('data', (chunk: Buffer) => {
					if (receivedBytes + chunk.length > AI_RESPONSE_MAX_BYTES) {
						const error = new Error(localize("util.AIHttpTransport.theAiResponseExceedsTheReceiveLimit", { formatByteSize: formatByteSize(AI_RESPONSE_MAX_BYTES) }))
						finish(reject, error)
						response.destroy(error)
						return
					}
					receivedBytes += chunk.length
					if (isFirstChunk) {
						isFirstChunk = false
						request.onProgress?.(localize("util.AIHttpTransport.receivedTheFirstResponseByteContinuingToReceiveData"))
					}
					chunks.push(chunk)

					if (receivedBytes > AI_RESPONSE_WARNING_BYTES && !oversizedResponseApproved && !responseApproval) {
						response.pause()
						clientRequest.setTimeout(0)
						const actions = [
							{ title: localize("util.AIHttpTransport.continueReceiving"), action: 'continue' as const },
							{ title: localize("util.AIHttpTransport.cancel"), action: 'cancel' as const },
						]
						const approval = vscode.window.showWarningMessage(
							localize("util.AIHttpTransport.theAiResponseHasReachedAboveTheWarningThreshold", { formatByteSize: formatByteSize(receivedBytes), formatByteSize2: formatByteSize(AI_RESPONSE_WARNING_BYTES) }),
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
							const error = new UserCancelledError("util.AIHttpTransport.theUserCancelledReceivingTheOversizedAiResponse")
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
								finish(reject, new Error(localize("util.AIHttpTransport.unableToParseTheAiResponseData")))
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
				: new Error(localize("util.AIHttpTransport.networkRequestFailed", { message: error.message }))))
			if (request.token) {
				cancellationDisposable = request.token.onCancellationRequested(() => {
					clientRequest.destroy(new UserCancelledError("util.AIHttpTransport.theUserCancelledTheAiTask"))
				})
				if (request.token.isCancellationRequested) {
					clientRequest.destroy(new UserCancelledError("util.AIHttpTransport.theUserCancelledTheAiTask"))
				}
			}

			clientRequest.setTimeout(timeoutMs, () => {
				clientRequest.destroy(new Error(localize("util.AIHttpTransport.theAiRequestTimedOutAfterSeconds", { timeoutS: request.timeoutS })))
			})
			totalTimeout = setTimeout(() => {
				clientRequest.destroy(new Error(localize("util.AIHttpTransport.theAiRequestExceededSecondsInTotal", { timeoutS: request.timeoutS })))
			}, timeoutMs)

			request.onProgress?.(localize("util.AIHttpTransport.connectingAndWaitingForTheAiResponseThisMay"))
			clientRequest.write(request.payload)
			clientRequest.end()
		} catch (error) {
			finish(reject, new Error(localize("util.AIHttpTransport.failedToConstructTheRequest", { errorMessage: error instanceof Error ? error.message : String(error) })))
		}
	})
}
