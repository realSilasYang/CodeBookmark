/**
 * 声明未受信任工作区需要限制的 AI 设置，并判断当前工作区是否允许发起 AI 请求。
 * 本地书签仍可在受限工作区使用；只有可能发送源码或改变请求目标的能力被关闭。
 */
export const RESTRICTED_WORKSPACE_CONFIGURATION_KEYS = Object.freeze([
	'codebookmark.globalStoragePath',
	'codebookmark.AI.address',
	'codebookmark.AI.APIKey',
	'codebookmark.AI.model',
	'codebookmark.AI.assignIcons',
	'codebookmark.AI.timeoutS',
	'codebookmark.AI.prompt',
	'codebookmark.AI.optimizePrompt',
])

export function workspaceAllowsAI(isTrusted: boolean): boolean {
	return isTrusted
}
