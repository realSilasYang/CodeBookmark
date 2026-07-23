export const ExtensionStateKeys = {
	recentIcons: 'codebookmark.recentIcons',
} as const

// setKeysForSync replaces the complete synchronization list on every call.
// Keep that list centralized so adding another synchronized state cannot
// accidentally stop synchronization for an existing one.
export const SyncedGlobalStateKeys: readonly string[] = [
	ExtensionStateKeys.recentIcons,
]
