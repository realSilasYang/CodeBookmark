import * as os from 'os'
import * as path from 'path'
import { localize } from '../i18n/Localization'

export function resolveStoragePath(input: string): string {
	let resolved = input.trim()
	resolved = resolved.replace(/^~([\\/].*)?$/, (_match, suffix) => path.join(os.homedir(), suffix || ''))
	resolved = resolved.replace(/%([^%]+)%/g, (_match, name) => {
		const value = process.env[name]
		if (value === undefined) throw new Error(localize(`环境变量未定义: ${name}`, `Environment variable is not defined: ${name}`))
		return value
	})
	return path.normalize(resolved)
}
