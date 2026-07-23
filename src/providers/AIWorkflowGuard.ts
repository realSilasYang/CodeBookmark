/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `AIWorkflowGuard`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`AIStorageScopeChangedError`、`isAIStorageScopeChangedError`、`AIWorkflowGuard`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import { localize } from '../i18n/Localization'

interface AIBookmarkSnapshotValue {
	toJSON(): unknown
}

export class AIStorageScopeChangedError extends Error {
	readonly isAIStorageScopeChange = true

	constructor() {
		super(localize(
			'书签作用域已切换，已停止应用 AI 结果。',
			'The bookmark scope changed, so the AI result was not applied.',
		))
		this.name = 'AIStorageScopeChangedError'
	}
}

export function isAIStorageScopeChangedError(error: unknown): error is AIStorageScopeChangedError {
	return error instanceof AIStorageScopeChangedError
		|| (typeof error === 'object' && error !== null
			&& (error as { isAIStorageScopeChange?: unknown }).isAIStorageScopeChange === true)
}

interface AIWorkflowGuardPort {
	currentStorageScope(): string | undefined
	bookmarksForPath(pathRel: string): readonly AIBookmarkSnapshotValue[]
}

export class AIWorkflowGuard {
	constructor(private readonly port: AIWorkflowGuardPort) {}

	captureBookmarkInput(pathRel: string): string {
		return JSON.stringify(this.port.bookmarksForPath(pathRel).map(bookmark => bookmark.toJSON()))
	}

	assertBookmarkInput(pathRel: string, snapshot: string): void {
		if (this.captureBookmarkInput(pathRel) !== snapshot) {
			throw new Error(localize(
				'AI 请求期间书签已被修改，已停止应用过期结果。',
				'Bookmarks changed while the AI request was running, so the stale result was not applied.',
			))
		}
	}

	assertStorageScope(scope: string): void {
		if (this.port.currentStorageScope() !== scope) {
			throw new AIStorageScopeChangedError()
		}
	}
}
