/**
 * 封装工作区顺序文件的读取、版本迁移、规范化和原子写入。
 * 对外始终返回副本，调用方修改数组后必须显式保存，避免绕过格式校验。
 */
import * as path from 'path'
import { localize } from '../i18n/Localization'
import { absolutePathKey } from '../util/AbsolutePath'
import {
	appendWorkspaceOrderPath,
	decodeWorkspaceOrderPersistence,
	insertWorkspaceOrderFile,
	mergeWorkspaceOrder,
	moveWorkspaceOrderDirectory,
	removeWorkspaceOrderFile,
	removeWorkspaceOrderTree,
	renameWorkspaceOrderDirectory,
	renameWorkspaceOrderFile,
	workspaceOrderFileIndex,
	workspaceOrderPersistence,
} from '../models/WorkspaceOrder'

interface WorkspaceOrderIO {
	exists(filePath: string): Promise<boolean>
	readJson(filePath: string): Promise<unknown>
	writeJson(filePath: string, value: unknown): Promise<boolean>
	migrateJson?(filePath: string, value: unknown): Promise<boolean>
	deleteFile(filePath: string): Promise<void>
}

interface WorkspaceOrderRelocation {
	oldBookmarkFolder: string
	newBookmarkFolder: string
	oldBookmarkPath: string
	newBookmarkPath: string
}

interface WorkspaceOrderSnapshot {
	filePath: string
	exists: boolean
	order: string[]
	usesWorkspaceLayout: boolean
}

export class WorkspaceOrderStore {
	constructor(private readonly io: WorkspaceOrderIO) {}

	async append(
		folder: string,
		bookmarkPath: string,
		failureMessage?: string,
	): Promise<void> {
		const snapshot = await this.read(folder)
		if (snapshot.usesWorkspaceLayout) return
		const order = appendWorkspaceOrderPath(snapshot.order, bookmarkPath)
		await this.write(snapshot.filePath, order, failureMessage)
	}

	async removeTree(folder: string, bookmarkPath: string): Promise<void> {
		const snapshot = await this.read(folder)
		if (snapshot.usesWorkspaceLayout || !snapshot.exists) return
		const result = removeWorkspaceOrderTree(snapshot.order, bookmarkPath)
		if (!result.changed) return
		if (result.order.length === 0) await this.io.deleteFile(snapshot.filePath)
		else await this.write(snapshot.filePath, result.order)
	}

	async indexOf(folder: string, bookmarkPath: string): Promise<number | undefined> {
		const snapshot = await this.read(folder)
		if (snapshot.usesWorkspaceLayout || !snapshot.exists) return undefined
		const index = workspaceOrderFileIndex(snapshot.order, bookmarkPath)
		return index >= 0 ? index : undefined
	}

	async renameFile(relocation: WorkspaceOrderRelocation, preferredIndex?: number): Promise<void> {
		const oldSnapshot = await this.read(relocation.oldBookmarkFolder)
		if (absolutePathKey(relocation.oldBookmarkFolder) === absolutePathKey(relocation.newBookmarkFolder)) {
			if (oldSnapshot.usesWorkspaceLayout) return
			const result = renameWorkspaceOrderFile(
				oldSnapshot.order,
				relocation.oldBookmarkPath,
				relocation.newBookmarkPath,
				preferredIndex,
			)
			if (result.changed) await this.write(oldSnapshot.filePath, result.order)
			return
		}

		const remaining = removeWorkspaceOrderFile(oldSnapshot.order, relocation.oldBookmarkPath).order
		if (oldSnapshot.exists && !oldSnapshot.usesWorkspaceLayout) {
			if (remaining.length === 0) await this.io.deleteFile(oldSnapshot.filePath)
			else await this.write(oldSnapshot.filePath, remaining)
		}
		if (path.basename(path.dirname(relocation.newBookmarkFolder)) !== 'scopes') return
		const newSnapshot = await this.read(relocation.newBookmarkFolder)
		if (newSnapshot.usesWorkspaceLayout) return
		const newOrder = insertWorkspaceOrderFile(
			newSnapshot.order,
			relocation.newBookmarkPath,
			preferredIndex,
		).order
		await this.write(newSnapshot.filePath, newOrder)
	}

	async renameDirectory(relocation: WorkspaceOrderRelocation): Promise<void> {
		const oldSnapshot = await this.read(relocation.oldBookmarkFolder)
		if (oldSnapshot.usesWorkspaceLayout) return
		if (!oldSnapshot.exists) return
		if (absolutePathKey(relocation.oldBookmarkFolder) === absolutePathKey(relocation.newBookmarkFolder)) {
			const renamed = renameWorkspaceOrderDirectory(
				oldSnapshot.order,
				relocation.oldBookmarkPath,
				relocation.newBookmarkPath,
			)
			await this.write(oldSnapshot.filePath, renamed)
			return
		}

		const { moved, remaining } = moveWorkspaceOrderDirectory(
			oldSnapshot.order,
			relocation.oldBookmarkPath,
			relocation.newBookmarkPath,
		)
		if (remaining.length === 0) await this.io.deleteFile(oldSnapshot.filePath)
		else await this.write(oldSnapshot.filePath, remaining)
		if (moved.length === 0) return
		const newSnapshot = await this.read(relocation.newBookmarkFolder)
		if (newSnapshot.usesWorkspaceLayout) return
		await this.write(newSnapshot.filePath, mergeWorkspaceOrder(newSnapshot.order, moved))
	}

	private async read(folder: string): Promise<WorkspaceOrderSnapshot> {
		const filePath = path.join(folder, '_workspace_order.json')
		const usesWorkspaceLayout = await this.io.exists(path.join(folder, '_workspace_layout.json'))
		if (usesWorkspaceLayout) return { filePath, exists: false, order: [], usesWorkspaceLayout }
		const exists = await this.io.exists(filePath)
		const decoded = exists
			? decodeWorkspaceOrderPersistence(await this.io.readJson(filePath))
			: undefined
		if (decoded?.migrated) {
			const writer = this.io.migrateJson ?? this.io.writeJson
			if (!await writer(filePath, decoded.value)) {
				throw new Error(localize("repository.WorkspaceOrderStore.unableToMigrateTheWorkspaceOrderFile", { filePath }))
			}
		}
		return {
			filePath,
			exists,
			order: decoded?.order ?? [],
			usesWorkspaceLayout,
		}
	}

	private async write(filePath: string, order: readonly string[], failureMessage?: string): Promise<void> {
		if (!await this.io.writeJson(filePath, workspaceOrderPersistence(order))) {
			throw new Error(failureMessage ?? localize("repository.WorkspaceOrderStore.unableToUpdateTheWorkspaceOrderFile", { filePath }))
		}
	}
}
