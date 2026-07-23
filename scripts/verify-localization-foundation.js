/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-localization-foundation`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-localization-foundation` 对应契约。
 * 核心边界：通过断言锁定“verify-localization-foundation”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
