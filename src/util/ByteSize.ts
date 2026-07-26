/**
 * 使用二进制单位格式化字节数，与 AI 请求、响应和源码大小提示保持一致。
 * 小于 1 MiB 时向上取整到 KiB，达到 1 MiB 后固定保留两位小数。
 */
export function formatBinaryByteSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
	return `${Math.ceil(bytes / 1024)} KiB`
}
