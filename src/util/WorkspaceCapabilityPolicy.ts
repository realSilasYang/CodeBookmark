import * as vscode from 'vscode'
import { localize } from '../i18n/Localization'
import { workspaceAllowsAI } from './WorkspaceCapabilities'

export function assertAIWorkspaceTrusted(): void {
	if (workspaceAllowsAI(vscode.workspace.isTrusted !== false)) return
	throw new Error(localize(
		'当前工作区未受信任，AI 功能已停用。信任此工作区后才能向外部 AI 服务发送源码。',
		'AI features are disabled because this workspace is not trusted. Trust it before sending source code to an external AI service.',
	))
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
