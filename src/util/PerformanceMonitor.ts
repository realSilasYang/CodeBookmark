import { performance } from 'node:perf_hooks'
import { logger } from './Logger'

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
			const fields = Object.entries(detail)
				.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
				.map(([key, value]) => `${key}=${value}`)
				.join(' ')
			logger.info(`[PERF] ${name} durationMs=${durationMs.toFixed(1)}${fields ? ` ${fields}` : ''}`)
		}
		return durationMs
	}
}

export const performanceMonitor = new PerformanceMonitor()
