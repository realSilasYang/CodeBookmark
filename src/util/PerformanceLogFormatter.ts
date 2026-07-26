/**
 * 把内部性能指标整理成人能直接阅读的诊断文本。
 * 真实耗时是阶段墙钟时间；并发累计耗时只用于定位 I/O 成本，不能彼此相加。
 */
import { localize } from '../i18n/Localization'

export type PerformanceDetail = Record<string, string | number | boolean | undefined>

function finiteNumber(detail: PerformanceDetail, key: string): number {
	const value = detail[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function milliseconds(value: number): string {
	return value.toFixed(1)
}

function count(value: number): string {
	return Math.max(0, Math.trunc(value)).toString()
}

function percentage(part: number, total: number): string {
	return (total > 0 ? part / total * 100 : 0).toFixed(1)
}

function displayValue(value: string | number | boolean): string {
	if (value === true) return localize('util.PerformanceMonitor.booleanTrue')
	if (value === false) return localize('util.PerformanceMonitor.booleanFalse')
	return String(value)
}

function formatWorkspaceCodeMarkerScan(durationMs: number, detail: PerformanceDetail): string {
	const files = finiteNumber(detail, 'files')
	const bytesRead = finiteNumber(detail, 'bytesRead')
	const prefilteredFiles = finiteNumber(detail, 'prefilteredFiles')
	const exactScans = finiteNumber(detail, 'exactScans')
	return localize('util.PerformanceMonitor.workspaceCodeMarkerScanDetails', {
		name: localize('util.PerformanceMonitor.workspaceCodeMarkerScan'),
		totalMs: milliseconds(durationMs),
		discoveryMs: milliseconds(finiteNumber(detail, 'discoveryMs')),
		processingMs: milliseconds(finiteNumber(detail, 'processingMs')),
		files: count(files),
		discoveredFiles: count(finiteNumber(detail, 'discoveredFiles')),
		openedDocuments: count(finiteNumber(detail, 'openedDocuments')),
		readMiB: (bytesRead / 1024 / 1024).toFixed(2),
		discoveryQueryMs: milliseconds(finiteNumber(detail, 'discoveryQueryMs')),
		discoveryQueries: count(finiteNumber(detail, 'discoveryQueries')),
		openMs: milliseconds(finiteNumber(detail, 'openMs')),
		readMs: milliseconds(finiteNumber(detail, 'readMs')),
		exactScanMs: milliseconds(finiteNumber(detail, 'exactScanMs')),
		prefilteredFiles: count(prefilteredFiles),
		prefilterRate: percentage(prefilteredFiles, files),
		exactScans: count(exactScans),
		exactRate: percentage(exactScans, files),
		changedFiles: count(finiteNumber(detail, 'changedFiles')),
	})
}

export function formatPerformanceLog(name: string, durationMs: number, detail: PerformanceDetail): string {
	if (name === 'workspace-code-marker-scan') return formatWorkspaceCodeMarkerScan(durationMs, detail)
	const displayNames: Record<string, string> = {
		'bookmark-view-background-enhancement': localize('util.PerformanceMonitor.bookmarkViewBackgroundEnhancement'),
		'bookmark-view-initialization': localize('util.PerformanceMonitor.bookmarkViewInitialization'),
	}
	const detailNames: Record<string, string> = {
		files: localize('util.PerformanceMonitor.files'),
		changed: localize('util.PerformanceMonitor.changed'),
		scope: localize('util.PerformanceMonitor.scope'),
		bookmarks: localize('util.PerformanceMonitor.bookmarks'),
		heapMiB: localize('util.PerformanceMonitor.extensionHostHeapMiB'),
		failed: localize('util.PerformanceMonitor.failed'),
	}
	const fields = Object.entries(detail)
		.filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
		.map(([key, value]) => `${detailNames[key] ?? key}=${displayValue(value)}`)
		.join(' ')
	return localize('util.PerformanceMonitor.perfDurationms', {
		name: displayNames[name] ?? name,
		toFixed: milliseconds(durationMs),
		fields: fields ? ` ${fields}` : '',
	})
}
