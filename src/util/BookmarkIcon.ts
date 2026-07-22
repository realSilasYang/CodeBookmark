import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeBookmarkIconName } from './BookmarkIconName'

export { normalizeBookmarkIconName } from './BookmarkIconName'

export const bookmarkIcon = {
	getCustomIcon(iconFileName: string): { light: vscode.Uri, dark: vscode.Uri } {
		const safeName = normalizeBookmarkIconName(iconFileName)
		const uri = vscode.Uri.file(path.join(__dirname, '..', '..', 'resources', 'custom_icons', safeName));
		return { light: uri, dark: uri };
	}
};
