/**
 * 判断未知值是否为可安全按键读取的普通 JSON 对象。
 * 数组、null 和原始值会被排除，供所有外部 JSON 解析器共享同一入口检查。
 */
export type JsonRecord = Record<string, unknown>

export function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
