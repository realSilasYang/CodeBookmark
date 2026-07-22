import * as path from 'path'
import { absolutePathKey } from '../util/AbsolutePath'
import {
	appendWorkspaceOrderPath,
	insertWorkspaceOrderFile,
	mergeWorkspaceOrder,
	moveWorkspaceOrderDirectory,
	parseWorkspaceOrder,
	removeWorkspaceOrderFile,
	removeWorkspaceOrderTree,
	renameWorkspaceOrderDirectory,
	renameWorkspaceOrderFile,
	workspaceOrderFileIndex,
} from '../models/WorkspaceOrder'

interface WorkspaceOrderIO {
	exists(filePath: string): Promise<boolean>
	readJson(filePath: string): Promise<unknown>
	writeJson(filePath: string, value: unknown): Promise<boolean>
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
		return {
			filePath,
			exists,
			order: exists ? parseWorkspaceOrder(await this.io.readJson(filePath)) : [],
		}
	}

	private async write(filePath: string, order: readonly string[], failureMessage?: string): Promise<void> {
		if (!await this.io.writeJson(filePath, order)) {
			throw new Error(failureMessage ?? `无法更新工作区排序文件: ${filePath}`)
		}
	}
}
