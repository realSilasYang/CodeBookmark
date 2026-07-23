/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `WorkspaceCapabilityPolicy`。
 *
 * 实现要点：集中表达允许、拒绝和限额规则，让安全边界不散落在调用流程中。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`assertAIWorkspaceTrusted`、`ensureAIWorkspaceTrusted`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
