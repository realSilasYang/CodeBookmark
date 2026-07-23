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
