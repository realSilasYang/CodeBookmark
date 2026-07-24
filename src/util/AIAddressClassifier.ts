/**
 * 按主机名识别本地服务、Azure、Vertex AI 和 Ollama，为地址补全与协议选择提供事实标签。
 * 判断只看规范化 hostname，不根据路径片段猜测供应商，减少相似域名造成的误路由。
 */
function normalizedHostname(hostname: string): string {
	return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
}

export function isLocalAIHostname(hostname: string): boolean {
	const normalized = normalizedHostname(hostname)
	return normalized === 'localhost'
		|| normalized.endsWith('.localhost')
		|| normalized === '0.0.0.0'
		|| /^127(?:\.\d{1,3}){3}$/.test(normalized)
		|| normalized === '::'
		|| normalized === '::1'
		|| normalized === '0:0:0:0:0:0:0:1'
		|| normalized === '::ffff:127.0.0.1'
		|| normalized === 'host.docker.internal'
		|| normalized === 'gateway.docker.internal'
		|| normalized === 'host.containers.internal'
}

export function isAzureAIHostname(hostname: string): boolean {
	const normalized = normalizedHostname(hostname)
	return [
		'.openai.azure.com',
		'.openai.azure.us',
		'.openai.azure.cn',
		'.services.ai.azure.com',
		'.services.ai.azure.us',
		'.services.ai.azure.cn',
	].some(suffix => normalized.endsWith(suffix))
}

export function isVertexAIHostname(hostname: string): boolean {
	const normalized = normalizedHostname(hostname)
	return normalized === 'aiplatform.googleapis.com' || normalized.endsWith('-aiplatform.googleapis.com')
}

export function isOllamaHostname(hostname: string): boolean {
	return /(?:^|[.-])ollama(?:[.-]|$)/.test(normalizedHostname(hostname))
}
