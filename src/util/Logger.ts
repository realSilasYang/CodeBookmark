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
			// VS Code can close output channels before extension deactivation finishes.
		}
	}

	private normalizeMessage(message: unknown): string {
		const text = String(message)
		return currentLanguage() === 'zh-cn' ? text.replace(/\(/g, '（').replace(/\)/g, '）') : text
	}

	info(message: unknown) {
		this.appendLine(`${localize('[信息]', '[INFO]')} ${this.normalizeMessage(message)}`);
	}

	error(message: unknown) {
		console.error(message);
		this.appendLine(`${localize('[错误]', '[ERROR]')} ${this.normalizeMessage(message)}`);
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
