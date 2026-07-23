/**
 * 模块说明：本文件负责无界面基础能力与纯逻辑工具，具体对象为 `Logger`。
 *
 * 实现要点：集中实现 `Logger` 的无界面规则和边界处理，供多个上层流程复用。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`logger`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
