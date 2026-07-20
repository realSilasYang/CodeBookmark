
import * as vscode from 'vscode'
import { ExtensionConfig } from '../config/ExtensionConfig'
export function configurationSubscriber(context: vscode.ExtensionContext,
) {
	configurationBookmark.config(context)

	const onDidChange = vscode.workspace.onDidChangeConfiguration(event => {
		configurationBookmark.onDidChange(event)
	})

	context.subscriptions.push(
		onDidChange,
	)
}

class ConfigurationBookmark implements IConfiguration {
	config(_context: vscode.ExtensionContext): void {
		const globalStoragePath = vscode.workspace.getConfiguration('codebookmark').get('globalStoragePath');
		ExtensionConfig.globalStoragePath = globalStoragePath ? String(globalStoragePath) : '';
	}
	onDidChange(event: vscode.ConfigurationChangeEvent): void {
		if (event.affectsConfiguration('codebookmark.globalStoragePath')) {
			const globalStoragePath = vscode.workspace.getConfiguration('codebookmark').get('globalStoragePath');
			ExtensionConfig.globalStoragePath = globalStoragePath ? String(globalStoragePath) : '';
		}
	}
}
const configurationBookmark = new ConfigurationBookmark()

interface IConfiguration {
	config(_context: vscode.ExtensionContext): void;
	onDidChange(event: vscode.ConfigurationChangeEvent): void;
}
