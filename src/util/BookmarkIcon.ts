import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeBookmarkIconName } from './BookmarkIconName'

export { normalizeBookmarkIconName } from './BookmarkIconName'

let customIconRoot: vscode.Uri | undefined

export function initializeBookmarkIconRoot(extensionUri: vscode.Uri): void {
	customIconRoot = vscode.Uri.joinPath(extensionUri, 'resources', 'custom_icons')
}

export const bookmarkIcon = {
	getCustomIcon(iconFileName: string): { light: vscode.Uri, dark: vscode.Uri } {
		const safeName = normalizeBookmarkIconName(iconFileName)
		const uri = customIconRoot
			? vscode.Uri.joinPath(customIconRoot, safeName)
			: vscode.Uri.file(path.join(__dirname, '..', '..', 'resources', 'custom_icons', safeName));
		return { light: uri, dark: uri };
	}
};
