/**
 * 集中声明随扩展发布的 README 文档，以及每种界面语言应打开的文件。
 * 路径使用 VSIX 内部的正斜杠形式；调用处再按段交给 `Uri.joinPath`，避免平台差异。
 */
import type { SupportedLanguage } from './Localization'

const README_DOCUMENT_BY_LANGUAGE: Readonly<Record<SupportedLanguage, string>> = {
	'zh-cn': 'README.md',
	'zh-hk': 'docs/README.zh-HK.md',
	'zh-tw': 'docs/README.zh-TW.md',
	en: 'docs/README.en.md',
	ja: 'docs/README.ja.md',
	vi: 'docs/README.vi.md',
	ko: 'docs/README.ko.md',
	es: 'docs/README.es.md',
	fr: 'docs/README.fr.md',
	pt: 'docs/README.pt.md',
	ru: 'docs/README.ru.md',
	de: 'docs/README.de.md',
	it: 'docs/README.it.md',
}

export const README_DOCUMENTS = Object.freeze(Object.values(README_DOCUMENT_BY_LANGUAGE))

export function readmeDocumentForLanguage(language: SupportedLanguage): string {
	return README_DOCUMENT_BY_LANGUAGE[language]
}
