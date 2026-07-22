export const SOURCE_SCAN_EXCLUDED_DIRECTORIES = new Set([
	'.git', '.hg', '.svn', '.next', '.nuxt', '.cache', '.history', '.venv',
	'node_modules', 'coverage', 'dist', 'build', 'out', 'target', 'vendor',
])

export const SOURCE_SCAN_EXCLUDE_GLOB = '**/{.git,.hg,.svn,.next,.nuxt,.cache,.history,.venv,node_modules,coverage,dist,build,out,target,vendor}/**'

export function isExcludedSourceRelativePath(relativePath: string): boolean {
	return relativePath.split(/[\\/]/).some(segment => SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(segment.toLowerCase()))
}
