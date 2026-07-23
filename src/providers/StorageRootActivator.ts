/**
 * 模块说明：本文件负责视图状态、工作流与 VS Code 适配，具体对象为 `StorageRootActivator`。
 *
 * 实现要点：通过小型端口连接纯逻辑与 VS Code API，使状态变化顺序可独立验证。
 * 核心边界：通过端口或协调器隔离可变状态与 VS Code API，确保异步流程可取消、可测试且不跨作用域串扰。
 * 主要入口：`ensureStorageRootActive`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
	reportPostTransferFailure(error: unknown): void
	showPostTransferFailure(error: unknown): void
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
	let transferCompleted = false
	if (previousRoot && !port.sameRoot(previousRoot, configuredRoot) && port.rootExists(previousRoot)) {
		try {
			await port.transferRoot(previousRoot, configuredRoot)
			transferCompleted = true
		} catch (error) {
			port.activateRoot(previousRoot)
			port.reportTransferFailure(error)
			port.showTransferFailure(error)
			return true
		}
	}

	port.activateRoot(configuredRoot)
	try {
		await port.rememberRoot(configuredRoot)
	} catch (error) {
		if (!transferCompleted) throw error
		port.reportPostTransferFailure(error)
		port.showPostTransferFailure(error)
	}
	return true
}
