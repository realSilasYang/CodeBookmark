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
