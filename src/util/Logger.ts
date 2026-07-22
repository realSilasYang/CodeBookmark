import * as vscode from 'vscode';

class Logger implements vscode.Disposable {
	private channel = vscode.window.createOutputChannel('CodeBookmark');

	private normalizeMessage(message: unknown): string {
		return String(message).replace(/\(/g, '（').replace(/\)/g, '）')
	}

	info(message: unknown) {
		this.channel.appendLine(`[INFO] ${this.normalizeMessage(message)}`);
	}

	error(message: unknown) {
		console.error(message);
		this.channel.appendLine(`[ERROR] ${this.normalizeMessage(message)}`);
	}

	showWarningMessage(message: string) {
		void vscode.window.showWarningMessage(this.normalizeMessage(message));
	}
	showMessage(message: string) {
		void vscode.window.showInformationMessage(this.normalizeMessage(message));
	}

	dispose() {
		this.channel.dispose();
	}
}

export const logger = new Logger();
