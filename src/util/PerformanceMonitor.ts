/**
 * 按操作名称记录耗时、次数和慢调用，供开发诊断加载、扫描与保存性能。
 * 监控数据只驻留内存且不影响功能分支，正式用户数据不会随统计写入磁盘。
 */
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
				'workspace-code-marker-scan': localize("util.PerformanceMonitor.workspaceCodeMarkerScan"),
				'bookmark-view-background-enhancement': localize("util.PerformanceMonitor.bookmarkViewBackgroundEnhancement"),
				'bookmark-view-initialization': localize("util.PerformanceMonitor.bookmarkViewInitialization"),
			}
			const detailNames: Record<string, string> = {
				files: localize("util.PerformanceMonitor.files"),
				changed: localize("util.PerformanceMonitor.changed"),
				scope: localize("util.PerformanceMonitor.scope"),
				failed: localize("util.PerformanceMonitor.failed"),
			}
			const fields = Object.entries(detail)
				.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
				.map(([key, value]) => `${detailNames[key] ?? key}=${value}`)
				.join(' ')
			logger.info(localize("util.PerformanceMonitor.perfDurationms", { name: displayNames[name] ?? name, toFixed: durationMs.toFixed(1), fields: fields ? ` ${fields}` : '' }))
		}
		return durationMs
	}
}

export const performanceMonitor = new PerformanceMonitor()
