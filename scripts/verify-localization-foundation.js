/**
 * 核对默认中文回退、十三种语言解析、格式区域和用户取消错误的基础约定。
 * 脚本直接调用编译后的 `Localization`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')

const localization = require('../out/i18n/Localization')
const statistics = require('../out/util/BookmarkStatistics')

localization.initializeLocalization(undefined)
assert.equal(localization.currentLanguage(), 'zh-cn')
assert.equal(localization.currentFormattingLocale(), 'zh-CN')
assert.equal(localization.localize('common.unknown'), '未知')
assert.equal(localization.localize('bookmarkStatistics.level', { level: 12 }), '第 12 级')

localization.initializeLocalization('zh-TW')
assert.equal(localization.currentLanguage(), 'zh-tw')
assert.equal(localization.currentFormattingLocale(), 'zh-TW')

localization.initializeLocalization('zh_Hant')
assert.equal(localization.currentLanguage(), 'zh-tw')

localization.initializeLocalization('zh-HK')
assert.equal(localization.currentLanguage(), 'zh-hk')
assert.equal(localization.currentFormattingLocale(), 'zh-HK')

for (const [requested, language, formattingLocale, unknown, summary] of [
	['zh-CN', 'zh-cn', 'zh-CN', '未知', '共 2 个书签：一级 1 个、二级 1 个'],
	['zh-HK', 'zh-hk', 'zh-HK', '未知', '共 2 個書籤：一級 1 個、二級 1 個'],
	['zh-TW', 'zh-tw', 'zh-TW', '未知', '共 2 個書籤：一級 1 個、二級 1 個'],
	['en-US', 'en', 'en-US', 'Unknown', '2 bookmarks: Level 1: 1, Level 2: 1'],
	['ja-JP', 'ja', 'ja-JP', '不明', 'ブックマークは 2 件です: レベル 1: 1 件、レベル 2: 1 件'],
	['vi-VN', 'vi', 'vi-VN', 'không xác định', 'Tổng cộng 2 dấu trang: Cấp 1: 1, Cấp 2: 1'],
	['ko-KR', 'ko', 'ko-KR', '알 수 없음', '북마크 총 2개: 1단계 1개、2단계 1개'],
	['es-MX', 'es', 'es-ES', 'desconocido', '2 marcadores en total: Nivel 1: 1, Nivel 2: 1'],
	['fr-CA', 'fr', 'fr-FR', 'inconnu', '2 signets au total : Niveau 1 : 1, Niveau 2 : 1'],
	['pt-BR', 'pt', 'pt-BR', 'desconhecido', '2 marcadores no total: Nível 1: 1, Nível 2: 1'],
	['ru-RU', 'ru', 'ru-RU', 'неизвестно', 'Всего закладок: 2; Уровень 1: 1, Уровень 2: 1'],
	['de-DE', 'de', 'de-DE', 'unbekannt', 'Insgesamt 2 Lesezeichen: Ebene 1: 1, Ebene 2: 1'],
	['it-IT', 'it', 'it-IT', 'sconosciuto', '2 segnalibri in totale: Livello 1: 1, Livello 2: 1'],
]) {
	localization.initializeLocalization(requested)
	assert.equal(localization.currentLanguage(), language)
	assert.equal(localization.currentFormattingLocale(), formattingLocale)
	assert.equal(localization.localize('common.unknown'), unknown)
	assert.equal(statistics.formatBookmarkLevelSummary({ total: 2, levelCounts: [1, 1] }), summary)
}

localization.initializeLocalization('zh-MO')
assert.equal(localization.currentLanguage(), 'zh-hk')

localization.initializeLocalization('nl-NL')
assert.equal(localization.currentLanguage(), 'en')
assert.equal(localization.currentFormattingLocale(), 'en-US')
assert.equal(localization.localize('common.unknown'), 'Unknown')

const cancellation = new localization.UserCancelledError('util.AIService.theUserCancelledTheAiTask')
assert.equal(cancellation.isUserCancellation, true)
assert.equal(cancellation.message, 'The user cancelled the AI task')

localization.initializeLocalization('zh-cn')
console.log('Localization foundation contract verified.')
