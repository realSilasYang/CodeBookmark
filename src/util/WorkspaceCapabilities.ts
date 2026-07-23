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
