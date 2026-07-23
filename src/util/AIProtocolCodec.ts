/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `AIProtocolCodec`。
 *
 * 实现要点：解析并校验外部或持久化数据，只向调用方返回满足当前格式契约的结构。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`AIMessage`、`encodeAIProtocolRequest`、`decodeAIProtocolResponse`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import { isAzureAIHostname } from './AIAddressClassifier'
import { type AIProtocol, type AIRequestTarget } from './AIEndpointResolver'
import { aiResponseContent } from './AIResponseCodec'
import { isJsonRecord } from './JsonRecord'

export interface AIMessage {
	role: string
	content: string
}

interface AIProtocolRequest {
	headers: Record<string, string>
	payload: string
}

const ANTHROPIC_VERSION = '2023-06-01'
const ANTHROPIC_MAX_OUTPUT_TOKENS = 8192

function isAzureDeploymentTarget(target: AIRequestTarget): boolean {
	return isAzureAIHostname(target.url.hostname) && /\/openai\/deployments\/[^/]+\//i.test(target.url.pathname)
}

function authorizationHeaders(target: AIRequestTarget, apiKey: string): Record<string, string> {
	if (target.protocol === 'anthropic-messages') {
		return {
			'anthropic-version': ANTHROPIC_VERSION,
			...(apiKey ? { 'x-api-key': apiKey } : {}),
		}
	}
	if (!apiKey) return {}
	if (target.protocol === 'gemini-generate-content') {
		const hostname = target.url.hostname.toLowerCase()
		return hostname === 'aiplatform.googleapis.com' || hostname.endsWith('-aiplatform.googleapis.com')
			? { Authorization: `Bearer ${apiKey}` }
			: { 'x-goog-api-key': apiKey }
	}
	if (isAzureAIHostname(target.url.hostname)) return { 'api-key': apiKey }
	return { Authorization: `Bearer ${apiKey}` }
}

function openAIResponsesPayload(messages: AIMessage[], model: string): object {
	return {
		model,
		input: messages.map(message => ({ role: message.role, content: message.content })),
		store: false,
	}
}

function anthropicPayload(messages: AIMessage[], model: string): object {
	const system = messages
		.filter(message => message.role === 'system' || message.role === 'developer')
		.map(message => message.content)
		.join('\n\n')
	const conversation = messages
		.filter(message => message.role !== 'system' && message.role !== 'developer')
		.map(message => ({
			role: message.role === 'assistant' ? 'assistant' : 'user',
			content: message.content,
		}))
	return {
		model,
		max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
		...(system ? { system } : {}),
		messages: conversation,
	}
}

function geminiPayload(messages: AIMessage[]): object {
	const system = messages
		.filter(message => message.role === 'system' || message.role === 'developer')
		.map(message => message.content)
		.join('\n\n')
	const contents = messages
		.filter(message => message.role !== 'system' && message.role !== 'developer')
		.map(message => ({
			role: message.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: message.content }],
		}))
	return {
		...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
		contents,
	}
}

export function encodeAIProtocolRequest(target: AIRequestTarget, messages: AIMessage[], model: string, apiKey: string): AIProtocolRequest {
	let body: object
	switch (target.protocol) {
		case 'openai-chat-completions':
			body = isAzureDeploymentTarget(target) ? { messages } : { model, messages }
			break
		case 'openai-responses':
			body = openAIResponsesPayload(messages, model)
			break
		case 'anthropic-messages':
			body = anthropicPayload(messages, model)
			break
		case 'gemini-generate-content':
			body = geminiPayload(messages)
			break
		case 'ollama-chat':
			body = { model, messages, stream: false }
			break
	}
	return {
		headers: {
			'Content-Type': 'application/json',
			...authorizationHeaders(target, apiKey),
		},
		payload: JSON.stringify(body),
	}
}

function arrayText(value: unknown): string {
	if (!Array.isArray(value)) return ''
	return value.map(item => {
		if (!isJsonRecord(item)) return ''
		return aiResponseContent(item.text)
	}).join('')
}

function openAIChatText(response: Record<string, unknown>): string {
	const choices = response.choices
	if (!Array.isArray(choices) || !isJsonRecord(choices[0])) return ''
	const choice = choices[0]
	const message = isJsonRecord(choice.message) ? choice.message : undefined
	return aiResponseContent(message?.content) || aiResponseContent(choice.text)
}

function openAIResponsesText(response: Record<string, unknown>): string {
	const direct = aiResponseContent(response.output_text)
	if (direct) return direct
	if (!Array.isArray(response.output)) return ''
	return response.output.map(item => {
		if (!isJsonRecord(item)) return ''
		return arrayText(item.content) || aiResponseContent(item.text)
	}).join('')
}

function anthropicText(response: Record<string, unknown>): string {
	return arrayText(response.content)
}

function geminiText(response: Record<string, unknown>): string {
	if (!Array.isArray(response.candidates) || !isJsonRecord(response.candidates[0])) return ''
	const content = isJsonRecord(response.candidates[0].content) ? response.candidates[0].content : undefined
	return arrayText(content?.parts)
}

function ollamaText(response: Record<string, unknown>): string {
	const message = isJsonRecord(response.message) ? response.message : undefined
	return aiResponseContent(message?.content) || aiResponseContent(response.response)
}

export function decodeAIProtocolResponse(protocol: AIProtocol, response: unknown): string {
	if (!isJsonRecord(response)) return ''
	switch (protocol) {
		case 'openai-chat-completions': return openAIChatText(response)
		case 'openai-responses': return openAIResponsesText(response)
		case 'anthropic-messages': return anthropicText(response)
		case 'gemini-generate-content': return geminiText(response)
		case 'ollama-chat': return ollamaText(response)
	}
}
