/**
 * 模块说明：本文件负责持久化、索引与迁移事务，具体对象为 `WorkspaceOrderStore`。
 *
 * 实现要点：维护可变状态及其索引，对外提供原子更新和一致快照。
 * 核心边界：所有磁盘状态都必须经过校验与原子化处理，不能让部分写入覆盖仍有效的用户数据。
 * 主要入口：`WorkspaceOrderStore`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
}

export class WorkspaceOrderStore {
	constructor(private readonly io: WorkspaceOrderIO) {}

	async append(
		folder: string,
		bookmarkPath: string,
		failureMessage?: string,
	): Promise<void> {
		const snapshot = await this.read(folder)
		const order = appendWorkspaceOrderPath(snapshot.order, bookmarkPath)
		await this.write(snapshot.filePath, order, failureMessage)
	}

	async removeTree(folder: string, bookmarkPath: string): Promise<void> {
		const snapshot = await this.read(folder)
		if (!snapshot.exists) return
		const result = removeWorkspaceOrderTree(snapshot.order, bookmarkPath)
		if (!result.changed) return
		if (result.order.length === 0) await this.io.deleteFile(snapshot.filePath)
		else await this.write(snapshot.filePath, result.order)
	}

	async indexOf(folder: string, bookmarkPath: string): Promise<number | undefined> {
		const snapshot = await this.read(folder)
		if (!snapshot.exists) return undefined
		const index = workspaceOrderFileIndex(snapshot.order, bookmarkPath)
		return index >= 0 ? index : undefined
	}

	async renameFile(relocation: WorkspaceOrderRelocation, preferredIndex?: number): Promise<void> {
		const oldSnapshot = await this.read(relocation.oldBookmarkFolder)
		if (absolutePathKey(relocation.oldBookmarkFolder) === absolutePathKey(relocation.newBookmarkFolder)) {
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
		if (oldSnapshot.exists) {
			if (remaining.length === 0) await this.io.deleteFile(oldSnapshot.filePath)
			else await this.write(oldSnapshot.filePath, remaining)
		}
		if (path.basename(path.dirname(relocation.newBookmarkFolder)) !== 'scopes') return
		const newSnapshot = await this.read(relocation.newBookmarkFolder)
		const newOrder = insertWorkspaceOrderFile(
			newSnapshot.order,
			relocation.newBookmarkPath,
			preferredIndex,
		).order
		await this.write(newSnapshot.filePath, newOrder)
	}

	async renameDirectory(relocation: WorkspaceOrderRelocation): Promise<void> {
		const oldSnapshot = await this.read(relocation.oldBookmarkFolder)
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
		await this.write(newSnapshot.filePath, mergeWorkspaceOrder(newSnapshot.order, moved))
	}

	private async read(folder: string): Promise<WorkspaceOrderSnapshot> {
		const filePath = path.join(folder, '_workspace_order.json')
		const exists = await this.io.exists(filePath)
		const decoded = exists
			? decodeWorkspaceOrderPersistence(await this.io.readJson(filePath))
			: undefined
		if (decoded?.migrated) {
			const writer = this.io.migrateJson ?? this.io.writeJson
			if (!await writer(filePath, decoded.value)) {
				throw new Error(localize(`无法迁移工作区排序文件: ${filePath}`, `Unable to migrate the workspace order file: ${filePath}`))
			}
		}
		return {
			filePath,
			exists,
			order: decoded?.order ?? [],
		}
	}

	private async write(filePath: string, order: readonly string[], failureMessage?: string): Promise<void> {
		if (!await this.io.writeJson(filePath, workspaceOrderPersistence(order))) {
			throw new Error(failureMessage ?? localize(`无法更新工作区排序文件: ${filePath}`, `Unable to update the workspace order file: ${filePath}`))
		}
	}
}
