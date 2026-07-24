/**
 * 在 AI 操作开始前检查工作区信任、配置完整性和存储作用域，并生成贯穿请求的取消信号。
 * 请求结束时再次核对作用域；用户切换目录或工作区后，旧结果不会落入新的书签集合。
 */
import { localize } from '../i18n/Localization'

interface AIBookmarkSnapshotValue {
	toJSON(): unknown
}

export class AIStorageScopeChangedError extends Error {
	readonly isAIStorageScopeChange = true

	constructor() {
		super(localize("providers.AIWorkflowGuard.theBookmarkScopeChangedSoTheAiResultWas"))
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
			throw new Error(localize("providers.AIWorkflowGuard.bookmarksChangedWhileTheAiRequestWasRunningSo"))
		}
	}

	assertStorageScope(scope: string): void {
		if (this.port.currentStorageScope() !== scope) {
			throw new AIStorageScopeChangedError()
		}
	}
}
