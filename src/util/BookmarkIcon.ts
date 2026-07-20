import * as path from 'path';
import * as vscode from 'vscode';

export enum IconType {
	bookmark_gutter = 'bookmark_gutter',
	bookmarks_gutter = 'bookmarks_gutter',
	bookmark = 'bookmark',
	bookmarks = 'bookmarks',
	watcher = 'watcher',
	open_folder = 'open_folder',
	folder = 'folder',
	open_folder_green = 'open_folder_green'
}

// Stub for backward compatibility where needed (e.g. models fetching icon names, though gutter rendering is now in manager)
export const bookmarkIcon = {
	getIcon(icon: IconType, _mode?: 'green' | 'dark' | 'light'): vscode.Uri {
		return vscode.Uri.file(path.join(__dirname, '..', '..', 'resources', `${icon}.svg`))
	},
	getCustomIcon(iconFileName: string): { light: vscode.Uri, dark: vscode.Uri } {
		const uri = vscode.Uri.file(path.join(__dirname, '..', '..', 'resources', 'custom_icons', iconFileName));
		return { light: uri, dark: uri };
	}
};