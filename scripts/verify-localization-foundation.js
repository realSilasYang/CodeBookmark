const assert = require('node:assert/strict')

const localization = require('../out/i18n/Localization')

localization.initializeLocalization(undefined)
assert.equal(localization.currentLanguage(), 'zh-cn')
assert.equal(localization.currentFormattingLocale(), 'zh-CN')
assert.equal(localization.localize('中文', 'English'), '中文')

localization.initializeLocalization('zh-TW')
assert.equal(localization.currentLanguage(), 'zh-cn')

localization.initializeLocalization('zh_Hant')
assert.equal(localization.currentLanguage(), 'zh-cn')

localization.initializeLocalization('en-US')
assert.equal(localization.currentLanguage(), 'en')
assert.equal(localization.currentFormattingLocale(), 'en-US')
assert.equal(localization.localize('中文', 'English'), 'English')

localization.initializeLocalization('ja')
assert.equal(localization.currentLanguage(), 'en')

localization.initializeLocalization('zh-cn')
console.log('Localization foundation contract verified.')
