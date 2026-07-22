interface StorageRootActivationPort {
	rememberedRoot(): string | undefined
	ensureConfigured(): boolean
	configuredRoot(): string
	activeRoot(): string | undefined
	rootExists(root: string): boolean
	sameRoot(left: string, right: string): boolean
	transferRoot(source: string, target: string): Promise<void>
	activateRoot(root: string): void
	rememberRoot(root: string): Promise<void>
	warnRememberedFallback(): void
	reportTransferFailure(error: unknown): void
	showTransferFailure(error: unknown): void
}

export async function ensureStorageRootActive(port: StorageRootActivationPort): Promise<boolean> {
	const rememberedRoot = port.rememberedRoot()
	if (!port.ensureConfigured()) {
		if (rememberedRoot && port.rootExists(rememberedRoot)) {
			port.activateRoot(rememberedRoot)
			port.warnRememberedFallback()
			return true
		}
		return false
	}

	const configuredRoot = port.configuredRoot()
	const previousRoot = port.activeRoot() ?? rememberedRoot
	if (previousRoot && !port.sameRoot(previousRoot, configuredRoot) && port.rootExists(previousRoot)) {
		try {
			await port.transferRoot(previousRoot, configuredRoot)
		} catch (error) {
			port.activateRoot(previousRoot)
			port.reportTransferFailure(error)
			port.showTransferFailure(error)
			return true
		}
	}

	port.activateRoot(configuredRoot)
	await port.rememberRoot(configuredRoot)
	return true
}
