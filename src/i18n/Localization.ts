/**
 * 运行时本地化入口。业务代码只引用稳定键；语言目录负责文案、占位符和格式区域。
 * 中文是探测失败时的默认语言，明确的未注册语言环境回退到英文。
 */
import { messages as englishMessages } from './catalogs/en'
import { messages as spanishMessages } from './catalogs/es'
import { messages as frenchMessages } from './catalogs/fr'
import { messages as germanMessages } from './catalogs/de'
import { messages as italianMessages } from './catalogs/it'
import { messages as japaneseMessages } from './catalogs/ja'
import { messages as koreanMessages } from './catalogs/ko'
import { messages as portugueseMessages } from './catalogs/pt'
import { messages as russianMessages } from './catalogs/ru'
import { messages as defaultMessages } from './catalogs/zh-cn'
import { messages as hongKongChineseMessages } from './catalogs/zh-hk'
import { messages as taiwanChineseMessages } from './catalogs/zh-tw'
import { messages as vietnameseMessages } from './catalogs/vi'

const catalogs = {
	'zh-cn': {
		formattingLocale: 'zh-CN',
		messages: defaultMessages,
	},
	'zh-hk': {
		formattingLocale: 'zh-HK',
		messages: hongKongChineseMessages,
	},
	'zh-tw': {
		formattingLocale: 'zh-TW',
		messages: taiwanChineseMessages,
	},
	en: {
		formattingLocale: 'en-US',
		messages: englishMessages,
	},
	ja: {
		formattingLocale: 'ja-JP',
		messages: japaneseMessages,
	},
	ko: {
		formattingLocale: 'ko-KR',
		messages: koreanMessages,
	},
	fr: {
		formattingLocale: 'fr-FR',
		messages: frenchMessages,
	},
	de: {
		formattingLocale: 'de-DE',
		messages: germanMessages,
	},
	ru: {
		formattingLocale: 'ru-RU',
		messages: russianMessages,
	},
	vi: {
		formattingLocale: 'vi-VN',
		messages: vietnameseMessages,
	},
	es: {
		formattingLocale: 'es-ES',
		messages: spanishMessages,
	},
	pt: {
		formattingLocale: 'pt-BR',
		messages: portugueseMessages,
	},
	it: {
		formattingLocale: 'it-IT',
		messages: italianMessages,
	},
} as const

export type SupportedLanguage = keyof typeof catalogs
export type LocalizationKey = keyof typeof defaultMessages
type LocalizationValue = unknown
type LocalizationValues = Readonly<Record<string, LocalizationValue>>

let activeLanguage: SupportedLanguage = 'zh-cn'

function normalizedLanguage(language: string): string {
	return language.trim().toLowerCase().replaceAll('_', '-')
}

function resolveLanguage(language: string | undefined): SupportedLanguage {
	if (language === undefined || language.trim() === '') return 'zh-cn'
	const normalized = normalizedLanguage(language)
	if (normalized === 'zh-hk' || normalized.startsWith('zh-hk-')
		|| normalized === 'zh-mo' || normalized.startsWith('zh-mo-')) return 'zh-hk'
	if (normalized === 'zh-tw' || normalized.startsWith('zh-tw-')
		|| normalized === 'zh-hant' || normalized.startsWith('zh-hant-')) return 'zh-tw'
	if (normalized === 'zh' || normalized === 'zh-cn' || normalized.startsWith('zh-cn-')
		|| normalized === 'zh-hans' || normalized.startsWith('zh-hans-')) return 'zh-cn'
	if (normalized in catalogs) return normalized as SupportedLanguage
	const baseLanguage = normalized.split('-')[0]
	if (baseLanguage in catalogs) return baseLanguage as SupportedLanguage
	return 'en'
}

export function initializeLocalization(language: string | undefined): void {
	activeLanguage = resolveLanguage(language)
}

export function currentLanguage(): SupportedLanguage {
	return activeLanguage
}

export function currentFormattingLocale(): string {
	return catalogs[activeLanguage].formattingLocale
}

function interpolate(message: string, values: LocalizationValues | undefined): string {
	if (!values) return message
	return message.replace(/\{([A-Za-z_$][\w$]*)\}/g, (placeholder, name: string) => {
		if (!Object.prototype.hasOwnProperty.call(values, name)) return placeholder
		return String(values[name] ?? '')
	})
}

export function localize(key: LocalizationKey, values?: LocalizationValues): string {
	return interpolate(catalogs[activeLanguage].messages[key], values)
}

export class UserCancelledError extends Error {
	readonly isUserCancellation = true

	constructor(key: LocalizationKey, values?: LocalizationValues) {
		super(localize(key, values))
		this.name = 'UserCancelledError'
	}
}

export function isUserCancelledError(error: unknown): error is UserCancelledError {
	return error instanceof UserCancelledError
		|| (typeof error === 'object' && error !== null && (error as { isUserCancellation?: unknown }).isUserCancellation === true)
}
