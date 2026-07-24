/**
 * 集中声明源码扫描要排除的依赖、构建、缓存和版本控制目录。
 * AI 与自动标记扫描共用这套策略，既减少无关 I/O，也避免读取生成物和第三方代码。
 */
export const SOURCE_SCAN_EXCLUDED_DIRECTORIES = new Set([
	'.git', '.hg', '.svn', '.next', '.nuxt', '.cache', '.history', '.venv',
	'node_modules', 'coverage', 'dist', 'build', 'out', 'target', 'vendor',
])

export const SOURCE_SCAN_EXCLUDE_GLOB = '**/{.git,.hg,.svn,.next,.nuxt,.cache,.history,.venv,node_modules,coverage,dist,build,out,target,vendor}/**'

export function isExcludedSourceRelativePath(relativePath: string): boolean {
	return relativePath.split(/[\\/]/).some(segment => SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(segment.toLowerCase()))
}
