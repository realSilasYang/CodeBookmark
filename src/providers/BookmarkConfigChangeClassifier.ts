interface BookmarkConfigChangeSource {
	collectExternalChanges(directory: string): Promise<readonly string[]>
	hasExternalChange(directory: string, filename: string): Promise<boolean>
}

export interface BookmarkConfigChangeClassification {
	orderChanged: boolean
	incrementalChanges: Map<string, Set<string>>
}

interface BookmarkConfigChangeClassifierPort {
	sameDirectory(left: string, right: string): boolean
	reportFailure(directory: string, error: unknown): void
}

const scriptConfigFilename = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i

export async function classifyBookmarkConfigChanges(
	changes: ReadonlyArray<readonly [string, ReadonlySet<string | null>]>,
	scriptFolder: string | null,
	workspaceFolder: string | null,
	source: BookmarkConfigChangeSource,
	port: BookmarkConfigChangeClassifierPort,
): Promise<BookmarkConfigChangeClassification> {
	let orderChanged = false
	const incrementalChanges = new Map<string, Set<string>>()
	const canIncrementallyRead = (directory: string): boolean => {
		return scriptFolder !== null && port.sameDirectory(directory, scriptFolder)
	}

	for (const [directory, filenames] of changes) {
		try {
			const namesAlreadyClassified = filenames.has(null)
			const exactNames = namesAlreadyClassified
				? await source.collectExternalChanges(directory)
				: [...filenames].filter((filename): filename is string => filename !== null)
			for (const filename of exactNames) {
				if (!filename || (!namesAlreadyClassified && !await source.hasExternalChange(directory, filename))) continue
				if (filename === '_workspace_order.json' && workspaceFolder
					&& port.sameDirectory(directory, workspaceFolder)) {
					orderChanged = true
					continue
				}
				if (!canIncrementallyRead(directory) || !scriptConfigFilename.test(filename)) continue
				const names = incrementalChanges.get(directory) ?? new Set<string>()
				names.add(filename)
				incrementalChanges.set(directory, names)
			}
		} catch (error) {
			port.reportFailure(directory, error)
		}
	}
	return { orderChanged, incrementalChanges }
}
