/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `AIAddressClassifier`。
 *
 * 实现要点：把原始输入归入互斥类别，为后续策略选择提供稳定判断。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`isLocalAIHostname`、`isAzureAIHostname`、`isVertexAIHostname`、`isOllamaHostname`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
