/**
 * 把工作区信任限制转换为可复用的断言与用户提示，供 AI 命令入口统一调用。
 * 检查失败会先引导用户理解原因，不会自动修改信任状态或绕过 VS Code 安全边界。
 */
import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import { workspaceAllowsAI } from './WorkspaceCapabilities'

export function assertAIWorkspaceTrusted(): void {
	if (workspaceAllowsAI(vscode.workspace.isTrusted !== false)) return
	throw new Error(localize("util.WorkspaceCapabilityPolicy.aiFeaturesAreDisabledBecauseThisWorkspaceIsNot"))
}

export function ensureAIWorkspaceTrusted(): boolean {
	try {
		assertAIWorkspaceTrusted()
		return true
	} catch (error) {
		void vscode.window.showWarningMessage(error instanceof Error ? error.message : String(error))
		return false
	}
}
