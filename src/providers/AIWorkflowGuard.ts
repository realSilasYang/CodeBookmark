interface AIBookmarkSnapshotValue {
	toJSON(): unknown
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
			throw new Error('AI 请求期间书签已被修改，已停止应用过期结果。')
		}
	}

	assertStorageScope(scope: string): void {
		if (this.port.currentStorageScope() !== scope) {
			throw new Error('书签作用域已切换，已停止应用 AI 结果。')
		}
	}
}
