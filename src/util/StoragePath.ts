/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `StoragePath`。
 *
 * 实现要点：统一路径规范化、比较和作用域判断，消除平台分隔符与大小写差异。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`resolveStoragePath`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
