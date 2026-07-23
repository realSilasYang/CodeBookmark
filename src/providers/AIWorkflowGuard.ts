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
