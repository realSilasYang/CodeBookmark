/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `SourceFilePolicy`。
 *
 * 实现要点：集中表达允许、拒绝和限额规则，让安全边界不散落在调用流程中。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`SOURCE_SCAN_EXCLUDED_DIRECTORIES`、`SOURCE_SCAN_EXCLUDE_GLOB`、`isExcludedSourceRelativePath`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export const SOURCE_SCAN_EXCLUDED_DIRECTORIES = new Set([
	'.git', '.hg', '.svn', '.next', '.nuxt', '.cache', '.history', '.venv',
	'node_modules', 'coverage', 'dist', 'build', 'out', 'target', 'vendor',
])

export const SOURCE_SCAN_EXCLUDE_GLOB = '**/{.git,.hg,.svn,.next,.nuxt,.cache,.history,.venv,node_modules,coverage,dist,build,out,target,vendor}/**'

export function isExcludedSourceRelativePath(relativePath: string): boolean {
	return relativePath.split(/[\\/]/).some(segment => SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(segment.toLowerCase()))
}
