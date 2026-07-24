/**
 * 延迟创建 CodeBookmark 输出通道，统一记录可诊断错误并在扩展停用时释放资源。
 * VS Code 已关闭通道时写入会静默结束，避免停用阶段的次生异常掩盖原问题。
 */
import * as vscode from 'vscode';
import { currentLanguage, localize } from '../i18n/Localization';

class Logger implements vscode.Disposable {
	private channel = vscode.window.createOutputChannel('CodeBookmark');
	private disposed = false

	private appendLine(message: string): void {
		if (this.disposed) return
		try {
			this.channel.appendLine(message)
		} catch {
			// VS Code 可能在扩展停用完成前先关闭输出通道，此时日志写入应静默结束。
		}
	}

	private normalizeMessage(message: unknown): string {
		const text = String(message)
		return currentLanguage() === 'zh-cn' ? text.replace(/\(/g, '（').replace(/\)/g, '）') : text
	}

	info(message: unknown) {
		this.appendLine(`${localize("util.Logger.info")} ${this.normalizeMessage(message)}`);
	}

	error(message: unknown) {
		console.error(message);
		this.appendLine(`${localize("util.Logger.error")} ${this.normalizeMessage(message)}`);
	}

	showWarningMessage(message: string) {
		void vscode.window.showWarningMessage(this.normalizeMessage(message));
	}
	showMessage(message: string) {
		void vscode.window.showInformationMessage(this.normalizeMessage(message));
	}

	dispose() {
		this.disposed = true
		this.channel.dispose();
	}
}

export const logger = new Logger();
