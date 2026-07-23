/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `AIEndpointResolver`。
 *
 * 实现要点：规范化多种输入形式并生成唯一可执行结果，集中处理补全与冲突规则。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`AIProtocol`、`AIRequestTarget`、`resolveAIRequestTargets`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import {
	isAzureAIHostname,
	isLocalAIHostname,
	isOllamaHostname,
	isVertexAIHostname,
} from './AIAddressClassifier'
import { localize } from '../i18n/Localization'

export type AIProtocol =
	| 'openai-chat-completions'
	| 'openai-responses'
	| 'anthropic-messages'
	| 'gemini-generate-content'
	| 'ollama-chat'

type AIEndpointInference = 'explicit' | 'normalized' | 'fallback'

export interface AIRequestTarget {
	url: URL
	protocol: AIProtocol
	inference: AIEndpointInference
}

interface OpenAIProviderProfile {
	hostname: string
	basePath: string
	alternativeBasePath?: string
}

const OPENAI_PROVIDER_PROFILES: OpenAIProviderProfile[] = [
	{ hostname: 'api.openai.com', basePath: '/v1' },
	{ hostname: 'openrouter.ai', basePath: '/api/v1' },
	{ hostname: 'api.groq.com', basePath: '/openai/v1' },
	{ hostname: 'api.deepseek.com', basePath: '', alternativeBasePath: '/v1' },
	{ hostname: 'api.mistral.ai', basePath: '/v1' },
	{ hostname: 'api.x.ai', basePath: '/v1' },
	{ hostname: 'api.together.xyz', basePath: '/v1' },
	{ hostname: 'api.siliconflow.cn', basePath: '/v1' },
	{ hostname: 'api.moonshot.cn', basePath: '/v1' },
	{ hostname: 'api.cerebras.ai', basePath: '/v1' },
	{ hostname: 'integrate.api.nvidia.com', basePath: '/v1' },
	{ hostname: 'api.fireworks.ai', basePath: '/inference/v1' },
	{ hostname: 'dashscope.aliyuncs.com', basePath: '/compatible-mode/v1' },
]

function parseAIAddress(value: string): URL {
	let trimmed = value.trim()
	if (!trimmed) throw new Error(localize('未配置 AI 接口地址。', 'The AI service address is not configured.'))
	for (const [opening, closing] of [['"', '"'], ["'", "'"], ['`', '`'], ['<', '>']]) {
		if (trimmed.startsWith(opening) && trimmed.endsWith(closing)) {
			trimmed = trimmed.slice(opening.length, -closing.length).trim()
			break
		}
	}
	if (!trimmed) throw new Error(localize('未配置 AI 接口地址。', 'The AI service address is not configured.'))

	let candidate = trimmed
	if (candidate.startsWith('//')) candidate = `https:${candidate}`
	else if (!candidate.includes('://')) {
		const authority = candidate.split(/[/?#]/, 1)[0]
		const host = authority.startsWith('[')
			? authority.slice(1, authority.indexOf(']'))
			: authority.replace(/:\d+$/, '')
		candidate = `${isLocalAIHostname(host) ? 'http' : 'https'}://${candidate}`
	}

	let url: URL
	try {
		url = new URL(candidate)
	} catch {
		throw new Error(localize('AI 接口地址不是有效的 URL。', 'The AI service address is not a valid URL.'))
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(localize('AI 接口地址必须使用 http:// 或 https://。', 'The AI service address must use http:// or https://.'))
	}
	if (url.username || url.password) {
		throw new Error(localize('AI 接口地址不能在 URL 中包含用户名或密码。', 'The AI service URL cannot contain a username or password.'))
	}
	url.hash = ''
	return url
}

function trimmedPath(pathname: string): string {
	if (!pathname || pathname === '/') return ''
	return pathname.replace(/\/+$/g, '')
}

function canonicalPath(pathname: string): string {
	return trimmedPath(pathname)
		.replace(/\/{2,}/g, '/')
		.replace(/(?:\/chat\/completions){2,}$/i, '/chat/completions')
		.replace(/(?:\/chat){2,}\/completions$/i, '/chat/completions')
		.replace(/(?:\/responses){2,}$/i, '/responses')
		.replace(/(?:\/messages){2,}$/i, '/messages')
		.replace(/(?:\/api\/chat){2,}$/i, '/api/chat')
		.replace(/(?::generatecontent){2,}$/i, ':generateContent')
}

function withPath(source: URL, pathname: string): URL {
	const result = new URL(source.toString())
	result.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`
	return result
}

function appendPath(source: URL, suffix: string): URL {
	return withPath(source, `${trimmedPath(source.pathname)}/${suffix.replace(/^\/+/, '')}`)
}

function explicitProtocol(pathname: string): AIProtocol | undefined {
	const path = trimmedPath(pathname).toLowerCase()
	if (path.endsWith('/chat/completions')) return 'openai-chat-completions'
	if (path.endsWith('/responses')) return 'openai-responses'
	if (path.endsWith('/messages')) return 'anthropic-messages'
	if (path.endsWith('/api/chat')) return 'ollama-chat'
	if (path.endsWith(':generatecontent')) return 'gemini-generate-content'
	return undefined
}

function partialOpenAIProtocolTarget(source: URL, pathname: string): AIRequestTarget | undefined {
	if (/\/chat$/i.test(pathname)) {
		return {
			url: appendPath(source, 'completions'),
			protocol: 'openai-chat-completions',
			inference: 'normalized',
		}
	}
	if (/\/chat\/completion$/i.test(pathname)) {
		return {
			url: withPath(source, `${pathname}s`),
			protocol: 'openai-chat-completions',
			inference: 'normalized',
		}
	}
	if (/\/(?:completion|completions)$/i.test(pathname)) {
		return {
			url: withPath(source, pathname.replace(/\/(?:completion|completions)$/i, '/chat/completions')),
			protocol: 'openai-chat-completions',
			inference: 'normalized',
		}
	}
	if (/\/response$/i.test(pathname)) {
		return {
			url: withPath(source, `${pathname}s`),
			protocol: 'openai-responses',
			inference: 'normalized',
		}
	}
	return undefined
}

function openAITargets(
	source: URL,
	basePaths: string[],
	protocols: readonly Extract<AIProtocol, 'openai-chat-completions' | 'openai-responses'>[] = ['openai-chat-completions', 'openai-responses'],
): AIRequestTarget[] {
	const targets: AIRequestTarget[] = []
	for (const [protocolIndex, protocol] of protocols.entries()) {
		for (const [baseIndex, basePath] of basePaths.entries()) {
			const base = withPath(source, basePath || '/')
			targets.push({
				url: appendPath(base, protocol === 'openai-chat-completions' ? 'chat/completions' : 'responses'),
				protocol,
				inference: baseIndex === 0 && protocolIndex === 0 ? 'normalized' : 'fallback',
			})
		}
	}
	return targets
}

function geminiTarget(source: URL, model: string): AIRequestTarget {
	let basePath = trimmedPath(source.pathname)
	const slashAction = basePath.match(/^(.*\/models\/[^/]+)\/(?:stream)?generatecontent$/i)
	if (slashAction) {
		return {
			url: withPath(source, `${slashAction[1]}:generateContent`),
			protocol: 'gemini-generate-content',
			inference: 'normalized',
		}
	}
	if (/\/models\/[^/]+$/i.test(basePath)) {
		return {
			url: withPath(source, `${basePath}:generateContent`),
			protocol: 'gemini-generate-content',
			inference: 'normalized',
		}
	}

	const modelName = model.trim().replace(/^models\//i, '')
	if (!modelName) throw new Error(localize('Gemini 接口需要配置模型名称。', 'Gemini requires a configured model name.'))
	if (!basePath) basePath = '/v1beta/models'
	else if (/\/v\d+(?:beta\d*)?$/i.test(basePath)) basePath += '/models'
	else if (!basePath.toLowerCase().endsWith('/models')) basePath += '/models'
	return {
		url: withPath(source, `${basePath}/${encodeURIComponent(modelName)}:generateContent`),
		protocol: 'gemini-generate-content',
		inference: 'normalized',
	}
}

function genericOpenAIBasePaths(pathname: string): string[] {
	const path = trimmedPath(pathname)
	if (!path) return ['/v1', '']
	if (/\/openai$/i.test(path)) return [path]
	if (/(?:^|\/)v\d+(?:beta\d*)?$/i.test(path) || /\/(?:api|openai)\/v\d+(?:beta\d*)?$/i.test(path)) return [path]
	return [path, `${path}/v1`]
}

function deduplicateTargets(targets: AIRequestTarget[], origin: string): AIRequestTarget[] {
	const seen = new Set<string>()
	return targets.filter(target => {
		if (target.url.origin !== origin) {
			throw new Error(localize('AI 接口候选地址必须与用户配置保持同源。', 'AI endpoint candidates must use the same origin as the configured address.'))
		}
		const key = `${target.protocol}\n${target.url.toString()}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

export function resolveAIRequestTargets(address: string, model: string): AIRequestTarget[] {
	const parsedSource = parseAIAddress(address)
	const path = canonicalPath(parsedSource.pathname)
	const source = withPath(parsedSource, path || '/')
	const lowerPath = path.toLowerCase()
	const hostname = source.hostname.toLowerCase()

	if (lowerPath.endsWith(':streamgeneratecontent')) {
		return [{
			url: withPath(source, `${path.slice(0, -':streamGenerateContent'.length)}:generateContent`),
			protocol: 'gemini-generate-content',
			inference: 'normalized',
		}]
	}

	const explicit = explicitProtocol(path)
	if (explicit) return [{ url: source, protocol: explicit, inference: 'explicit' }]

	if (hostname === 'generativelanguage.googleapis.com' && !/\/openai(?:\/|$)/i.test(path)) {
		return [geminiTarget(source, model)]
	}
	if (isVertexAIHostname(hostname) && /\/models(?:\/|$)/i.test(path)) {
		return [geminiTarget(source, model)]
	}
	if (hostname === 'api.anthropic.com') {
		if (/\/message$/i.test(path)) {
			return [{ url: withPath(source, `${path}s`), protocol: 'anthropic-messages', inference: 'normalized' }]
		}
		const base = !path ? withPath(source, '/v1') : source
		return [{ url: appendPath(base, 'messages'), protocol: 'anthropic-messages', inference: 'normalized' }]
	}
	if (isAzureAIHostname(hostname)) {
		const partialTarget = partialOpenAIProtocolTarget(source, path)
		if (partialTarget) return [partialTarget]
		let basePath = path
		if (!basePath || basePath === '/openai') basePath = '/openai/v1'
		else if (/\/openai\/deployments\/[^/]+$/i.test(basePath)) {
			return [{ url: appendPath(source, 'chat/completions'), protocol: 'openai-chat-completions', inference: 'normalized' }]
		}
		return deduplicateTargets(
			openAITargets(source, [basePath], ['openai-responses', 'openai-chat-completions']),
			source.origin,
		)
	}

	const isOllamaAddress = source.port === '11434'
		|| isOllamaHostname(hostname)
		|| (lowerPath === '/api' && isLocalAIHostname(hostname))
	if (isOllamaAddress && (lowerPath === '/chat' || lowerPath === '/api/generate')) {
		return [{ url: withPath(source, '/api/chat'), protocol: 'ollama-chat', inference: 'normalized' }]
	}
	if (isOllamaAddress && (!path || lowerPath === '/api')) {
		const base = lowerPath === '/api' ? source : appendPath(source, 'api')
		return [{ url: appendPath(base, 'chat'), protocol: 'ollama-chat', inference: 'normalized' }]
	}

	const partialTarget = partialOpenAIProtocolTarget(source, path)
	if (partialTarget) return [partialTarget]

	const provider = OPENAI_PROVIDER_PROFILES.find(profile => hostname === profile.hostname)
	const basePaths = provider
		? path
			? genericOpenAIBasePaths(path)
			: [provider.basePath, ...(provider.alternativeBasePath === undefined ? [] : [provider.alternativeBasePath])]
		: genericOpenAIBasePaths(path)
	return deduplicateTargets(openAITargets(source, basePaths), source.origin)
}
