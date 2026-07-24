/**
 * 把用户设置、工作区位置和默认全局目录解析成最终书签存储根路径。
 * 相对路径只在有明确工作区基准时接受，结果始终规范化为可比较的绝对路径。
 */
import * as os from 'os'
import * as path from 'path'
import { localize } from '../i18n/Localization'

export function resolveStoragePath(input: string): string {
	let resolved = input.trim()
	resolved = resolved.replace(/^~([\\/].*)?$/, (_match, suffix) => path.join(os.homedir(), suffix || ''))
	resolved = resolved.replace(/%([^%]+)%/g, (_match, name) => {
		const value = process.env[name]
		if (value === undefined) throw new Error(localize("util.StoragePath.environmentVariableIsNotDefined", { name }))
		return value
	})
	return path.normalize(resolved)
}
