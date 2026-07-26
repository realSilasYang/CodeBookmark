/**
 * 按操作名称记录耗时、次数和慢调用，供开发诊断加载、扫描与保存性能。
 * 监控数据只驻留内存且不影响功能分支，正式用户数据不会随统计写入磁盘。
 */
import { performance } from 'node:perf_hooks'
import { logger } from './Logger'
import { formatPerformanceLog, type PerformanceDetail } from './PerformanceLogFormatter'


class PerformanceMonitor {
	private readonly verbose = process.env.CODEBOOKMARK_PERF === '1'
	private readonly slowOperationMs = 250
	private readonly latestMeasurements = new Map<string, { durationMs: number, detail: PerformanceDetail }>()

	start(): number {
		return performance.now()
	}

	measure(name: string, startedAt: number, detail: PerformanceDetail = {}, thresholdMs = this.slowOperationMs): number {
		const durationMs = performance.now() - startedAt
		this.latestMeasurements.set(name, { durationMs, detail: { ...detail } })
		if (this.verbose || durationMs >= thresholdMs) {
			logger.info(formatPerformanceLog(name, durationMs, detail))
		}
		return durationMs
	}

	latest(name: string): { durationMs: number, detail: PerformanceDetail } | undefined {
		const measurement = this.latestMeasurements.get(name)
		return measurement ? { durationMs: measurement.durationMs, detail: { ...measurement.detail } } : undefined
	}
}

export const performanceMonitor = new PerformanceMonitor()
