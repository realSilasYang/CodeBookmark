/**
 * 规范化用户、AI 和持久化数据提供的图标名称，只接受资源库中的安全文件名。
 * 路径分隔符、上级目录和未知扩展名会被拒绝，从入口阻断图标路径穿越。
 */
import * as path from 'path'

const ICON_FILE_PATTERN = /^[a-z0-9][a-z0-9_.-]*\.svg$/i

export function normalizeBookmarkIconName(value: unknown): string {
	if (typeof value !== 'string' || !ICON_FILE_PATTERN.test(value)) return ''
	return path.basename(value) === value ? value : ''
}
