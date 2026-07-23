/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `RecentIconState`。
 *
 * 实现要点：封装状态读取、迁移和更新不变量，避免多个调用方直接操作底层表示。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`readRecentIconIds`、`writeRecentIconIds`、`migrateRecentIconState`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
import * as vscode from 'vscode'
import { ExtensionStateKeys } from './constants/ExtensionStateKeys'
import {
	decodePersistenceList,
	PersistenceFormats,
	versionPersistenceList,
} from './PersistenceSchema'

const blockedContexts = new WeakSet<vscode.ExtensionContext>()

function decodedRecentIconIds(value: unknown): { ids: string[], migrated: boolean } {
	const decoded = decodePersistenceList(value ?? [], PersistenceFormats.recentIcons, 'icons')
	return {
		ids: (decoded.value.icons as unknown[]).filter((item): item is string => typeof item === 'string'),
		migrated: decoded.migrated,
	}
}

export function readRecentIconIds(context: vscode.ExtensionContext): string[] {
	try {
		return decodedRecentIconIds(context.globalState.get<unknown>(ExtensionStateKeys.recentIcons)).ids
	} catch {
		blockedContexts.add(context)
		return []
	}
}

export async function writeRecentIconIds(
	context: vscode.ExtensionContext,
	icons: readonly string[],
): Promise<void> {
	if (blockedContexts.has(context)) {
		throw new Error('Recently used icons have an unsupported persistence format.')
	}
	await context.globalState.update(
		ExtensionStateKeys.recentIcons,
		versionPersistenceList(PersistenceFormats.recentIcons, 'icons', icons),
	)
}

export async function migrateRecentIconState(context: vscode.ExtensionContext): Promise<void> {
	const current = context.globalState.get<unknown>(ExtensionStateKeys.recentIcons)
	if (current === undefined) return
	let decoded: { ids: string[], migrated: boolean }
	try {
		decoded = decodedRecentIconIds(current)
	} catch (error) {
		blockedContexts.add(context)
		throw error
	}
	if (decoded.migrated) await writeRecentIconIds(context, decoded.ids)
}
