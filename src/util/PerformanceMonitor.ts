/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `PerformanceMonitor`。
 *
 * 实现要点：集中实现 `PerformanceMonitor` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`performanceMonitor`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
