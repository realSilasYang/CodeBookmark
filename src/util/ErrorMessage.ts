/**
 * 把未知捕获值转换为面向用户或日志的稳定文本。
 * Error 保留其 message；非 Error 值沿用 JavaScript 的字符串转换规则，避免各调用方产生不同提示。
 */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
