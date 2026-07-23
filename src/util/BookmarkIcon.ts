/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `BookmarkIcon`。
 *
 * 实现要点：集中实现 `BookmarkIcon` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`initializeBookmarkIconRoot`、`bookmarkIcon`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
