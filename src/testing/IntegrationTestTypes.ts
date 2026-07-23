export interface IntegrationBookmarkSnapshotNode {
	readonly id: string
	readonly label: string
	readonly path: string
	readonly isFile: boolean
	readonly scriptId?: string
	readonly line: number
	readonly children: readonly IntegrationBookmarkSnapshotNode[]
}

export interface IntegrationBookmarkSnapshot {
	readonly ready: boolean
	readonly storageScope?: string
	readonly roots: readonly IntegrationBookmarkSnapshotNode[]
}
