import * as vscode from 'vscode';

export class CodeBookmarkDecorationProvider implements vscode.FileDecorationProvider {
	provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FileDecoration> {
		if (uri.scheme === 'codebookmark-badge') {
			const query = uri.query;
			const params = new URLSearchParams(query);
			
			const badge = params.get('badge') || undefined;
			const tooltip = params.get('tooltip') || undefined;
			const color = params.get('color');

			return {
				badge: badge,
				tooltip: tooltip,
				color: color ? new vscode.ThemeColor(color) : undefined
			};
		}
		return undefined;
	}
}
