/**
 * 发现并校验扩展清单的稳定键语言目录，再计算 VS Code 实际需要打包的 NLS 文件。
 * 默认目录保持中文；官方非中文界面语言使用英文别名，避免缺少精确区域文件时回退成中文。
 */
const fs = require('node:fs')
const path = require('node:path')
const { decorateManifestMessages } = require('./manifest-menu-symbols')

const DEFAULT_MANIFEST_LOCALE = 'zh-cn'
const ENGLISH_MANIFEST_LOCALE = 'en'
const MANIFEST_CATALOG_PATTERN = /^manifest\.([a-z]{2,8}(?:-[a-z0-9]{1,8})*)\.json$/i
const GENERATED_NLS_PATTERN = /^package\.nls(?:\.[a-z]{2,8}(?:-[a-z0-9]{1,8})*)?\.json$/i

// VS Code 官方语言包使用这些非中文区域代码。package.nls.json 是中文，
// 因此每个官方非中文代码都需要明确的英文文件，不能依赖默认目录回退。
const OFFICIAL_NON_CHINESE_MANIFEST_LOCALES = Object.freeze([
	'en',
	'bg',
	'cs',
	'de',
	'es',
	'fr',
	'hu',
	'it',
	'ja',
	'ko',
	'pl',
	'pt-br',
	'ru',
	'tr',
	'vi',
])

// VS Code 官方葡萄牙语语言包使用 pt-BR；源码目录采用通用代码 pt，生成时
// 让二者共用经过人工校订的中性葡萄牙语清单。
const NON_CHINESE_MANIFEST_ALIASES = Object.freeze({
	'pt-br': 'pt',
})

// VS Code 及语言包会使用通用、文字体系和区域三种中文标识。简体别名使用
// 默认中文目录；繁体文字体系以台繁为兜底，澳门则使用地域更接近的港繁。
const SIMPLIFIED_CHINESE_MANIFEST_LOCALES = Object.freeze([
	'zh',
	'zh-cn',
	'zh-hans',
])
const TRADITIONAL_CHINESE_MANIFEST_ALIASES = Object.freeze({
	'zh-hant': 'zh-tw',
	'zh-mo': 'zh-hk',
})
const CHINESE_MANIFEST_LOCALES = Object.freeze([
	...SIMPLIFIED_CHINESE_MANIFEST_LOCALES,
	'zh-hk',
	'zh-tw',
	...Object.keys(TRADITIONAL_CHINESE_MANIFEST_ALIASES),
])

function normalizeLocale(locale) {
	return locale.trim().toLowerCase().replaceAll('_', '-')
}

function discoverManifestCatalogs(catalogRoot) {
	const catalogs = new Map()
	for (const fileName of fs.readdirSync(catalogRoot).sort()) {
		const match = MANIFEST_CATALOG_PATTERN.exec(fileName)
		if (!match) {
			if (/^manifest\..+\.json$/i.test(fileName)) {
				throw new Error('Invalid manifest catalog locale in file name: ' + fileName)
			}
			continue
		}
		const locale = normalizeLocale(match[1])
		if (catalogs.has(locale)) {
			throw new Error('Duplicate manifest locale after normalization: ' + locale)
		}
		const absolutePath = path.join(catalogRoot, fileName)
		const messages = JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
		if (!messages || Array.isArray(messages) || typeof messages !== 'object') {
			throw new Error('Manifest catalog must contain a JSON object: ' + fileName)
		}
		const invalidEntry = Object.entries(messages)
			.find(([key, value]) => key.length === 0 || typeof value !== 'string' || value.length === 0)
		if (invalidEntry) {
			throw new Error('Manifest catalog keys and values must be non-empty strings: '
				+ fileName + ' -> ' + invalidEntry[0])
		}
		catalogs.set(locale, Object.freeze(messages))
	}
	for (const requiredLocale of [DEFAULT_MANIFEST_LOCALE, ENGLISH_MANIFEST_LOCALE]) {
		if (!catalogs.has(requiredLocale)) {
			throw new Error('Missing required manifest catalog: manifest.' + requiredLocale + '.json')
		}
	}
	return catalogs
}

function buildManifestLocalizationFiles(catalogs) {
	const decoratedCatalogs = new Map([...catalogs]
		.map(([locale, messages]) => [locale, decorateManifestMessages(messages)]))
	const chineseMessages = decoratedCatalogs.get(DEFAULT_MANIFEST_LOCALE)
	const englishMessages = decoratedCatalogs.get(ENGLISH_MANIFEST_LOCALE)
	const files = new Map([['package.nls.json', chineseMessages]])

	for (const [locale, messages] of decoratedCatalogs) {
		files.set('package.nls.' + locale + '.json', messages)
	}
	for (const locale of SIMPLIFIED_CHINESE_MANIFEST_LOCALES) {
		const fileName = 'package.nls.' + locale + '.json'
		if (!files.has(fileName)) files.set(fileName, chineseMessages)
	}
	for (const [alias, sourceLocale] of Object.entries(TRADITIONAL_CHINESE_MANIFEST_ALIASES)) {
		const fileName = 'package.nls.' + alias + '.json'
		if (files.has(fileName)) continue
		const messages = decoratedCatalogs.get(sourceLocale)
		if (!messages) throw new Error('Missing manifest catalog required by alias ' + alias + ': ' + sourceLocale)
		files.set(fileName, messages)
	}
	for (const locale of OFFICIAL_NON_CHINESE_MANIFEST_LOCALES) {
		const fileName = 'package.nls.' + locale + '.json'
		if (files.has(fileName)) continue
		const sourceLocale = NON_CHINESE_MANIFEST_ALIASES[locale]
		const messages = sourceLocale ? decoratedCatalogs.get(sourceLocale) : englishMessages
		if (!messages) throw new Error('Missing manifest catalog required by alias ' + locale + ': ' + sourceLocale)
		files.set(fileName, messages)
	}
	return files
}

module.exports = {
	DEFAULT_MANIFEST_LOCALE,
	ENGLISH_MANIFEST_LOCALE,
	GENERATED_NLS_PATTERN,
	CHINESE_MANIFEST_LOCALES,
	NON_CHINESE_MANIFEST_ALIASES,
	OFFICIAL_NON_CHINESE_MANIFEST_LOCALES,
	SIMPLIFIED_CHINESE_MANIFEST_LOCALES,
	TRADITIONAL_CHINESE_MANIFEST_ALIASES,
	buildManifestLocalizationFiles,
	discoverManifestCatalogs,
	normalizeLocale,
}
