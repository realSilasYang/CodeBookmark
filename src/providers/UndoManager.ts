import * as vscode from 'vscode'
import { Bookmark } from '../models/Bookmark'
import { BookmarkSet } from '../models/BookmarkSet'
import { ContextBookmark } from '../util/ContextValue'
import { Commands } from '../util/constants/Commands'
import { logger } from '../util/Logger'
import { canonicalBookmarkPath, isSameOrDescendantBookmarkPath, renamedBookmarkPath } from '../util/BookmarkPath'
import { UNDO_ACTION_LABELS, type UndoAction } from '../util/UndoActions'
import { localize } from '../i18n/Localization'
import {
	isSameOrDescendantAbsolutePath,
	normalizedAbsolutePath,
	renamedAbsolutePath,
} from '../util/AbsolutePath'

interface UndoBookmarkData extends Record<string, unknown> {
	id?: string
	path?: string
	collapsibleState?: vscode.TreeItemCollapsibleState
	pinned?: boolean
	createdAt?: number
	scriptId?: string
	undoContextValue?: ContextBookmark
}

interface SerializedUndoState {
	bookmarks: unknown[]
	workspaceOrder: string[] | null
}

interface UndoEntry {
	state: string
	action: UndoAction
	sequence: number
	bytes: number
}

interface ScopeHistory {
	history: UndoEntry[]
	redoHistory: UndoEntry[]
	lastAccess: number
}

interface PersistedScopeHistory {
	scope: string
	history: UndoEntry[]
	redoHistory: UndoEntry[]
}

interface PersistedUndoSession {
	sessionId: string
	sequence: number
	scopes: PersistedScopeHistory[]
}

export interface CapturedUndoState {
	readonly state: string
	readonly scope: string
}

export interface UndoApplyResult {
	readonly action: UndoAction
	readonly workspaceOrder: string[] | null
}

const UNDO_SESSION_STATE_KEY = 'codebookmark.undoSessionState'

function isUndoEntry(value: unknown): value is UndoEntry {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const entry = value as Partial<UndoEntry>
	return typeof entry.state === 'string'
		&& typeof entry.action === 'string'
		&& entry.action in UNDO_ACTION_LABELS
		&& typeof entry.sequence === 'number'
		&& Number.isSafeInteger(entry.sequence)
		&& entry.sequence >= 0
		&& typeof entry.bytes === 'number'
		&& Number.isSafeInteger(entry.bytes)
		&& entry.bytes === Buffer.byteLength(entry.state)
}

export class UndoManager {
	private readonly scopes = new Map<string, ScopeHistory>()
	private activeScope = 'global'
	private sequence = 0
	private accessSequence = 0
	private totalHistoryBytes = 0
	private readonly maxHistory = 50
	private readonly maxHistoryBytes = 8 * 1024 * 1024
	private readonly maxScopes = 64
	private persistence: vscode.Memento | undefined
	private sessionId: string | undefined
	private persistenceTimer: NodeJS.Timeout | undefined
	private persistencePromise: Promise<void> = Promise.resolve()
	private persistenceDirty = false
	private contextUpdateGeneration = 0
	private contextUpdateRunning = false

	public initialize(context: vscode.ExtensionContext): void {
		this.persistence = context.workspaceState
		this.sessionId = vscode.env.sessionId
		this.scopes.clear()
		this.sequence = 0
		this.accessSequence = 0
		this.totalHistoryBytes = 0
		const saved = context.workspaceState.get<unknown>(UNDO_SESSION_STATE_KEY)
		if (typeof saved === 'object' && saved !== null && !Array.isArray(saved)) {
			const session = saved as Partial<PersistedUndoSession>
			if (session.sessionId === this.sessionId && Array.isArray(session.scopes)) {
				for (const item of session.scopes) {
					if (typeof item !== 'object' || item === null || typeof item.scope !== 'string'
						|| !Array.isArray(item.history) || !Array.isArray(item.redoHistory)
						|| !item.history.every(isUndoEntry) || !item.redoHistory.every(isUndoEntry)) continue
					const history = item.history.slice(-this.maxHistory)
					const redoHistory = item.redoHistory.slice(-this.maxHistory)
					this.scopes.set(item.scope, { history, redoHistory, lastAccess: ++this.accessSequence })
					this.totalHistoryBytes += [...history, ...redoHistory].reduce((total, entry) => total + entry.bytes, 0)
					for (const entry of [...history, ...redoHistory]) this.sequence = Math.max(this.sequence, entry.sequence)
				}
			}
		}
		this.enforceGlobalLimits()
		this.schedulePersistence()
		this.updateContexts()
	}

	private schedulePersistence(): void {
		if (!this.persistence || !this.sessionId) return
		this.persistenceDirty = true
		if (this.persistenceTimer) clearTimeout(this.persistenceTimer)
		this.persistenceTimer = setTimeout(() => {
			this.persistenceTimer = undefined
			void this.flushPersistence()
		}, 200)
	}

	public async flushPersistence(): Promise<void> {
		if (this.persistenceTimer) clearTimeout(this.persistenceTimer)
		this.persistenceTimer = undefined
		if (!this.persistence || !this.sessionId) return
		if (!this.persistenceDirty) {
			await this.persistencePromise
			return
		}
		this.persistenceDirty = false
		const state: PersistedUndoSession = {
			sessionId: this.sessionId,
			sequence: this.sequence,
			scopes: [...this.scopes.entries()].map(([scope, stack]) => ({
				scope,
				history: stack.history,
				redoHistory: stack.redoHistory,
			})),
		}
		const persistence = this.persistence
		const update = this.persistencePromise
			.then(() => persistence.update(UNDO_SESSION_STATE_KEY, state))
			.then(() => undefined)
		this.persistencePromise = update.catch(error => {
			this.persistenceDirty = true
			logger.error(localize(`撤销会话持久化失败：${error}`, `Failed to persist undo session: ${error}`))
		})
		await this.persistencePromise
	}

	private scopeKey(scope?: string): string {
		return scope || 'global'
	}

	private scopeHistory(scope: string, create = false): ScopeHistory | undefined {
		const key = this.scopeKey(scope)
		let result = this.scopes.get(key)
		if (!result && create) {
			result = { history: [], redoHistory: [], lastAccess: ++this.accessSequence }
			this.scopes.set(key, result)
		}
		if (result) result.lastAccess = ++this.accessSequence
		return result
	}

	private updateContexts(): void {
		this.contextUpdateGeneration++
		if (this.contextUpdateRunning) return
		this.contextUpdateRunning = true
		void this.flushContextUpdates()
	}

	private async flushContextUpdates(): Promise<void> {
		while (true) {
			const generation = this.contextUpdateGeneration
			const stack = this.scopeHistory(this.activeScope)
			const undoAction = stack?.history[stack.history.length - 1]?.action ?? ''
			const redoAction = stack?.redoHistory[stack.redoHistory.length - 1]?.action ?? ''
			try {
				await Promise.all([
					vscode.commands.executeCommand('setContext', Commands.varCanUndo, undoAction !== ''),
					vscode.commands.executeCommand('setContext', Commands.varCanRedo, redoAction !== ''),
					vscode.commands.executeCommand('setContext', Commands.varUndoOperation, undoAction),
					vscode.commands.executeCommand('setContext', Commands.varRedoOperation, redoAction),
				])
			} catch (error) {
				logger.error(localize(`更新撤销命令上下文失败：${error}`, `Failed to update undo contexts: ${error}`))
			}
			if (generation === this.contextUpdateGeneration) {
				this.contextUpdateRunning = false
				return
			}
		}
	}

	private serialize(bookmarks: BookmarkSet, workspaceOrder: readonly string[] | null = null): string {
		const state: SerializedUndoState = {
			bookmarks: bookmarks.values.map(bookmark => ({
				...bookmark.toJSON(),
				// File-node identity is persisted outside Bookmark.toJSON(). Undo
				// snapshots must carry it or the next save creates a new script identity.
				scriptId: bookmark.isFile ? bookmark.scriptId : undefined,
				undoContextValue: bookmark.contextValue,
			})),
			workspaceOrder: workspaceOrder ? [...workspaceOrder] : null,
		}
		return JSON.stringify(state)
	}

	private restore(bookmarks: BookmarkSet, state: string): string[] | null {
		const data = JSON.parse(state) as unknown
		if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error(localize('撤销状态不是对象', 'Undo state is not an object'))
		const serialized = data as Partial<SerializedUndoState>
		if (!Array.isArray(serialized.bookmarks)) throw new Error(localize('撤销书签状态不是数组', 'Undo bookmarks state is not an array'))
		if (serialized.workspaceOrder !== null && serialized.workspaceOrder !== undefined
			&& (!Array.isArray(serialized.workspaceOrder) || serialized.workspaceOrder.some(item => typeof item !== 'string'))) {
			throw new Error(localize('撤销工作区顺序无效', 'Undo workspace order is invalid'))
		}
		const restored = serialized.bookmarks.map(item => {
			if (typeof item !== 'object' || item === null) throw new Error(localize('撤销状态包含无效书签', 'Undo state contains an invalid bookmark'))
			const undoItem = item as UndoBookmarkData
			const bookmark = Bookmark.fromJSON(undoItem)
			if (undoItem.undoContextValue !== ContextBookmark.File) return bookmark

			const fileNode = new Bookmark({
				id: undoItem.id,
				path: undoItem.path,
				contextValue: ContextBookmark.File,
				subs: bookmark.subs,
				collapsible: undoItem.collapsibleState,
				createdAt: undoItem.createdAt,
				scriptId: undoItem.scriptId,
			})
			for (const child of fileNode.subs) child.parent = fileNode
			return fileNode
		})

		bookmarks.clear()
		bookmarks.addAll(restored)
		return serialized.workspaceOrder ? [...serialized.workspaceOrder] : null
	}

	private removeEntry(target: UndoEntry[], index: number): UndoEntry | undefined {
		const [removed] = target.splice(index, 1)
		if (removed) this.totalHistoryBytes -= removed.bytes
		return removed
	}

	private clearEntries(target: UndoEntry[]): void {
		for (const entry of target) this.totalHistoryBytes -= entry.bytes
		target.length = 0
	}

	private pushBounded(target: UndoEntry[], entry: UndoEntry): boolean {
		const last = target[target.length - 1]
		if (last?.state === entry.state && last.action === entry.action) return false
		if (entry.bytes > this.maxHistoryBytes) {
			this.enforceGlobalLimits()
			return false
		}
		target.push(entry)
		this.totalHistoryBytes += entry.bytes
		while (target.length > this.maxHistory) this.removeEntry(target, 0)
		this.enforceGlobalLimits()
		return target.includes(entry)
	}

	private enforceGlobalLimits(): void {
		while (this.totalHistoryBytes > this.maxHistoryBytes) {
			let oldest: { target: UndoEntry[], index: number, sequence: number } | undefined
			for (const stack of this.scopes.values()) {
				for (const target of [stack.history, stack.redoHistory]) {
					for (let index = 0; index < target.length; index++) {
						const sequence = target[index].sequence
						if (!oldest || sequence < oldest.sequence) oldest = { target, index, sequence }
					}
				}
			}
			if (!oldest) break
			this.removeEntry(oldest.target, oldest.index)
		}
		while (this.scopes.size > this.maxScopes) {
			const oldestScope = [...this.scopes.entries()]
				.filter(([scope]) => scope !== this.activeScope)
				.sort((left, right) => left[1].lastAccess - right[1].lastAccess)[0]
			if (!oldestScope) break
			this.clearEntries(oldestScope[1].history)
			this.clearEntries(oldestScope[1].redoHistory)
			this.scopes.delete(oldestScope[0])
		}
	}

	private createEntry(state: string, action: UndoAction): UndoEntry {
		return { state, action, sequence: ++this.sequence, bytes: Buffer.byteLength(state) }
	}

	private recalculateHistoryBytes(): void {
		this.totalHistoryBytes = 0
		for (const stack of this.scopes.values()) {
			for (const entry of [...stack.history, ...stack.redoHistory]) {
				entry.bytes = Buffer.byteLength(entry.state)
				this.totalHistoryBytes += entry.bytes
			}
		}
		this.enforceGlobalLimits()
	}

	public setActiveScope(scope?: string): void {
		this.activeScope = this.scopeKey(scope)
		this.updateContexts()
	}

	public captureState(
		bookmarks: BookmarkSet,
		scope?: string,
		workspaceOrder: readonly string[] | null = null,
	): CapturedUndoState {
		return { state: this.serialize(bookmarks, workspaceOrder), scope: this.scopeKey(scope ?? this.activeScope) }
	}

	public commitState(
		captured: CapturedUndoState,
		bookmarks: BookmarkSet,
		action: UndoAction,
		workspaceOrder: readonly string[] | null = null,
	): boolean {
		if (captured.state === this.serialize(bookmarks, workspaceOrder)) return false
		this.commitCapturedState(captured, action)
		return true
	}

	public commitCapturedState(captured: CapturedUndoState, action: UndoAction): void {
		this.saveSerializedState(captured.state, action, captured.scope)
	}

	public saveState(
		bookmarks: BookmarkSet,
		action: UndoAction = 'modifyBookmarks',
		scope?: string,
		workspaceOrder: readonly string[] | null = null,
	): void {
		this.saveSerializedState(this.serialize(bookmarks, workspaceOrder), action, this.scopeKey(scope ?? this.activeScope))
	}

	private saveSerializedState(state: string, action: UndoAction, scope: string): void {
		const stack = this.scopeHistory(scope, true)!
		this.pushBounded(stack.history, this.createEntry(state, action))
		this.clearEntries(stack.redoHistory)
		this.schedulePersistence()
		if (scope === this.activeScope) this.updateContexts()
	}

	public canUndo(scope?: string): boolean {
		return (this.scopeHistory(this.scopeKey(scope ?? this.activeScope))?.history.length ?? 0) > 0
	}

	public canRedo(scope?: string): boolean {
		return (this.scopeHistory(this.scopeKey(scope ?? this.activeScope))?.redoHistory.length ?? 0) > 0
	}

	public undoAction(scope?: string): UndoAction | undefined {
		const history = this.scopeHistory(this.scopeKey(scope ?? this.activeScope))?.history
		return history?.[history.length - 1]?.action
	}

	public redoAction(scope?: string): UndoAction | undefined {
		const history = this.scopeHistory(this.scopeKey(scope ?? this.activeScope))?.redoHistory
		return history?.[history.length - 1]?.action
	}

	public clear(scope?: string): void {
		if (scope === undefined) {
			this.scopes.clear()
			this.totalHistoryBytes = 0
		} else {
			const key = this.scopeKey(scope)
			const stack = this.scopes.get(key)
			if (stack) {
				this.clearEntries(stack.history)
				this.clearEntries(stack.redoHistory)
				this.scopes.delete(key)
			}
		}
		this.schedulePersistence()
		this.updateContexts()
	}

	public undo(
		currentBookmarks: BookmarkSet,
		scope?: string,
		workspaceOrder: readonly string[] | null = null,
	): UndoApplyResult | undefined {
		const key = this.scopeKey(scope ?? this.activeScope)
		const stack = this.scopeHistory(key)
		const previous = stack?.history[stack.history.length - 1]
		if (!stack || !previous) return undefined
		const currentState = this.serialize(currentBookmarks, workspaceOrder)
		const restoredOrder = this.applyState(currentBookmarks, previous.state, 'undo')
		if (restoredOrder === undefined) return undefined
		this.removeEntry(stack.history, stack.history.length - 1)
		this.pushBounded(stack.redoHistory, this.createEntry(currentState, previous.action))
		this.schedulePersistence()
		this.updateContexts()
		return { action: previous.action, workspaceOrder: restoredOrder }
	}

	public redo(
		currentBookmarks: BookmarkSet,
		scope?: string,
		workspaceOrder: readonly string[] | null = null,
	): UndoApplyResult | undefined {
		const key = this.scopeKey(scope ?? this.activeScope)
		const stack = this.scopeHistory(key)
		const next = stack?.redoHistory[stack.redoHistory.length - 1]
		if (!stack || !next) return undefined
		const currentState = this.serialize(currentBookmarks, workspaceOrder)
		const restoredOrder = this.applyState(currentBookmarks, next.state, 'redo')
		if (restoredOrder === undefined) return undefined
		this.removeEntry(stack.redoHistory, stack.redoHistory.length - 1)
		this.pushBounded(stack.history, this.createEntry(currentState, next.action))
		this.schedulePersistence()
		this.updateContexts()
		return { action: next.action, workspaceOrder: restoredOrder }
	}

	private applyState(currentBookmarks: BookmarkSet, state: string, operation: 'undo' | 'redo'): string[] | null | undefined {
		try {
			return this.restore(currentBookmarks, state)
		} catch (error) {
			logger.error(operation === 'undo'
				? localize('无法应用撤销书签状态', 'Failed to apply the undo bookmark state')
				: localize('无法应用重做书签状态', 'Failed to apply the redo bookmark state'))
			logger.error(error)
			return undefined
		}
	}

	private rewriteStatePath(state: string, oldBookmarkPath: string, newBookmarkPath: string): string {
		try {
			const parsed = JSON.parse(state) as unknown
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return state
			const envelope = parsed as Partial<SerializedUndoState>
			const rewriteItem = (value: unknown): void => {
				if (typeof value !== 'object' || value === null || Array.isArray(value)) return
				const item = value as Record<string, unknown>
				if (typeof item.path === 'string' && isSameOrDescendantBookmarkPath(item.path, oldBookmarkPath)) {
					item.path = renamedBookmarkPath(item.path, oldBookmarkPath, newBookmarkPath)
				}
				if (Array.isArray(item.subs)) item.subs.forEach(rewriteItem)
			}
			if (Array.isArray(envelope.bookmarks)) envelope.bookmarks.forEach(rewriteItem)
			if (Array.isArray(envelope.workspaceOrder)) {
				envelope.workspaceOrder = envelope.workspaceOrder.map(item => isSameOrDescendantBookmarkPath(item, oldBookmarkPath)
					? renamedBookmarkPath(item, oldBookmarkPath, newBookmarkPath)
					: item)
			}
			return JSON.stringify(envelope)
		} catch {
			return state
		}
	}

	private selectStatePath(
		state: string,
		oldBookmarkPath: string,
		newBookmarkPath: string,
		keepAffected: boolean,
	): string | undefined {
		try {
			const parsed = JSON.parse(state) as unknown
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
			const envelope = parsed as Partial<SerializedUndoState>
			if (!Array.isArray(envelope.bookmarks)) return undefined
			const isAffected = (value: unknown): boolean => {
				if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
				const item = value as Record<string, unknown>
				return typeof item.path === 'string'
					&& isSameOrDescendantBookmarkPath(item.path, oldBookmarkPath)
			}
			envelope.bookmarks = envelope.bookmarks.filter(item => isAffected(item) === keepAffected)
			if (envelope.bookmarks.length === 0) return undefined
			if (keepAffected) {
				const rewriteItem = (value: unknown): void => {
					if (typeof value !== 'object' || value === null || Array.isArray(value)) return
					const item = value as Record<string, unknown>
					if (typeof item.path === 'string' && isSameOrDescendantBookmarkPath(item.path, oldBookmarkPath)) {
						item.path = renamedBookmarkPath(item.path, oldBookmarkPath, newBookmarkPath)
					}
					if (Array.isArray(item.subs)) item.subs.forEach(rewriteItem)
				}
				envelope.bookmarks.forEach(rewriteItem)
			}
			if (Array.isArray(envelope.workspaceOrder)) {
				envelope.workspaceOrder = envelope.workspaceOrder
					.filter(item => isSameOrDescendantBookmarkPath(item, oldBookmarkPath) === keepAffected)
					.map(item => keepAffected ? renamedBookmarkPath(item, oldBookmarkPath, newBookmarkPath) : item)
			}
			return JSON.stringify(envelope)
		} catch {
			return undefined
		}
	}

	private transformEntries(
		entries: readonly UndoEntry[],
		transform: (state: string) => string | undefined,
	): UndoEntry[] {
		const output: UndoEntry[] = []
		for (const entry of entries) {
			const state = transform(entry.state)
			if (state === undefined) continue
			const next = { ...entry, state, bytes: Buffer.byteLength(state) }
			const previous = output[output.length - 1]
			if (previous?.state === next.state && previous.action === next.action) continue
			output.push(next)
		}
		return output.slice(-this.maxHistory)
	}

	private mergeScopeHistory(targetScope: string, incoming: ScopeHistory): void {
		const existing = this.scopes.get(targetScope)
		if (!existing) {
			this.scopes.set(targetScope, incoming)
			return
		}
		existing.history = [...existing.history, ...incoming.history]
			.sort((a, b) => a.sequence - b.sequence)
			.slice(-this.maxHistory)
		existing.redoHistory = [...existing.redoHistory, ...incoming.redoHistory]
			.sort((a, b) => a.sequence - b.sequence)
			.slice(-this.maxHistory)
		existing.lastAccess = ++this.accessSequence
	}

	public relocatePath(
		oldScope: string,
		newScope: string,
		oldBookmarkPath: string,
		newBookmarkPath: string,
		oldAbsolutePath: string,
		newAbsolutePath: string,
	): void {
		const normalizedOld = normalizedAbsolutePath(oldAbsolutePath)
		const normalizedNew = normalizedAbsolutePath(newAbsolutePath)
		const oldPath = canonicalBookmarkPath(oldBookmarkPath)
		const newPath = canonicalBookmarkPath(newBookmarkPath)
		if (oldScope === newScope) {
			const stack = this.scopes.get(oldScope)
			if (stack) {
				for (const entry of [...stack.history, ...stack.redoHistory]) {
					entry.state = this.rewriteStatePath(entry.state, oldPath, newPath)
				}
			}
			this.recalculateHistoryBytes()
			this.schedulePersistence()
			this.updateContexts()
			return
		}

		const standaloneScopes = [...this.scopes.entries()].filter(([scope]) => {
			if (!scope.startsWith('file:')) return false
			const candidate = normalizedAbsolutePath(scope.slice('file:'.length))
			return isSameOrDescendantAbsolutePath(candidate, normalizedOld)
		})

		if (!oldScope.startsWith('file:')) {
			const stack = this.scopes.get(oldScope)
			if (stack) {
				const originalHistory = [...stack.history]
				const originalRedo = [...stack.redoHistory]
				stack.history = this.transformEntries(originalHistory, state => this.selectStatePath(state, oldPath, newPath, false))
				stack.redoHistory = this.transformEntries(originalRedo, state => this.selectStatePath(state, oldPath, newPath, false))
				if (stack.history.length === 0 && stack.redoHistory.length === 0) this.scopes.delete(oldScope)

				if (newScope.startsWith('file:')) {
					const projected: ScopeHistory = {
						history: this.transformEntries(originalHistory, state => this.selectStatePath(state, oldPath, newPath, true)),
						redoHistory: this.transformEntries(originalRedo, state => this.selectStatePath(state, oldPath, newPath, true)),
						lastAccess: ++this.accessSequence,
					}
					if (projected.history.length > 0 || projected.redoHistory.length > 0) this.mergeScopeHistory(newScope, projected)
				}
			}
		}

		for (const [scope, stack] of standaloneScopes) {
			this.scopes.delete(scope)
			if (!newScope.startsWith('file:')) continue
			for (const entry of [...stack.history, ...stack.redoHistory]) {
				entry.state = this.rewriteStatePath(entry.state, oldPath, newPath)
			}
			let targetScope = newScope
			if (scope !== oldScope || standaloneScopes.length > 1) {
				const sourceFile = normalizedAbsolutePath(scope.slice('file:'.length))
				const targetFile = renamedAbsolutePath(sourceFile, normalizedOld, normalizedNew)
				targetScope = `file:${targetFile}`
			}
			this.mergeScopeHistory(targetScope, stack)
			if (this.activeScope === scope) this.activeScope = targetScope
		}
		this.recalculateHistoryBytes()
		this.schedulePersistence()
		this.updateContexts()
	}
}

export const undoManager = new UndoManager()
