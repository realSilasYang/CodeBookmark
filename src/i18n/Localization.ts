/**
 * 模块说明：本文件负责运行时本地化选择，具体对象为 `Localization`。
 *
 * 实现要点：根据 VS Code 语言环境选择中英文文本和格式区域，同时保持中文为默认回退。
 * 核心边界：保持输入输出、错误处理、异步时序和持久化格式稳定，避免注释整理改变任何运行行为。
 * 主要入口：`SupportedLanguage`、`initializeLocalization`、`currentLanguage`、`currentFormattingLocale`、`localize`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
export type SupportedLanguage = 'zh-cn' | 'en'

let activeLanguage: SupportedLanguage = 'zh-cn'

function isChineseLanguage(language: string | undefined): boolean {
	return language === undefined || language === '' || /^zh(?:[-_]|$)/i.test(language)
}

export function initializeLocalization(language: string | undefined): void {
	activeLanguage = isChineseLanguage(language) ? 'zh-cn' : 'en'
}

export function currentLanguage(): SupportedLanguage {
	return activeLanguage
}

export function currentFormattingLocale(): 'zh-CN' | 'en-US' {
	return activeLanguage === 'zh-cn' ? 'zh-CN' : 'en-US'
}

export function localize(chinese: string, english: string): string {
	return activeLanguage === 'zh-cn' ? chinese : english
}

export class UserCancelledError extends Error {
	readonly isUserCancellation = true

	constructor(chinese: string, english: string) {
		super(localize(chinese, english))
		this.name = 'UserCancelledError'
	}
}

export function isUserCancelledError(error: unknown): error is UserCancelledError {
	return error instanceof UserCancelledError
		|| (typeof error === 'object' && error !== null && (error as { isUserCancellation?: unknown }).isUserCancellation === true)
}
