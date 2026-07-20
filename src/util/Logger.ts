import * as vscode from 'vscode';

class Logger {
	private channel = vscode.window.createOutputChannel('CodeBookmark');
	private canLog: boolean = true;

	infor(message: any) {
		if (this.canLog) {
			console.log(message);
			this.channel.appendLine(String(message));
		}
	}

	error(message: any) {
		if (this.canLog) {
			console.error(message);
			this.channel.appendLine(`[ERROR] ${String(message)}`);
		}
	}

	warning(message: any) {
		if (this.canLog) {
			console.warn(message);
			this.channel.appendLine(`[WARN] ${String(message)}`);
		}
	}

	showWarningMessage(message: string) {
		if (this.canLog)
			vscode.window.showWarningMessage(message);
	}
	showMessage(message: string) {
		if (this.canLog)
			vscode.window.showInformationMessage(message);
	}

	showErrorMessage(message: string) {
		if (this.canLog)
			vscode.window.showErrorMessage(message);
	}
}

export const logger = new Logger();
