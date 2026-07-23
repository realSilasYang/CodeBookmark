import { performance } from 'node:perf_hooks'
import { logger } from './Logger'
import { localize } from '../i18n/Localization'

type PerformanceDetail = Record<string, string | number | boolean | undefined>

class PerformanceMonitor {
	private readonly verbose = process.env.CODEBOOKMARK_PERF === '1'
	private readonly slowOperationMs = 250

	start(): number {
		return performance.now()
	}

	measure(name: string, startedAt: number, detail: PerformanceDetail = {}, thresholdMs = this.slowOperationMs): number {
		const durationMs = performance.now() - startedAt
		if (this.verbose || durationMs >= thresholdMs) {
			const displayNames: Record<string, string> = {
				'workspace-code-marker-scan': localize('工作区代码标记扫描', 'workspace-code-marker-scan'),
				'bookmark-view-background-enhancement': localize('书签视图后台增强', 'bookmark-view-background-enhancement'),
				'bookmark-view-initialization': localize('书签视图初始化', 'bookmark-view-initialization'),
			}
			const detailNames: Record<string, string> = {
				files: localize('文件数', 'files'),
				changed: localize('变更数', 'changed'),
				scope: localize('作用域', 'scope'),
				failed: localize('失败', 'failed'),
			}
			const fields = Object.entries(detail)
				.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
				.map(([key, value]) => `${detailNames[key] ?? key}=${value}`)
				.join(' ')
			logger.info(localize(
				`[性能] ${displayNames[name] ?? name} 耗时毫秒=${durationMs.toFixed(1)}${fields ? ` ${fields}` : ''}`,
				`[PERF] ${displayNames[name] ?? name} durationMs=${durationMs.toFixed(1)}${fields ? ` ${fields}` : ''}`,
			))
		}
		return durationMs
	}
}

export const performanceMonitor = new PerformanceMonitor()
