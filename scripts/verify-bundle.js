/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-bundle`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-bundle` 对应契约。
 * 核心边界：通过断言锁定“verify-bundle”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')

const { loadLocalizedManifest } = require('./lib/localized-manifest')

const manifest = loadLocalizedManifest('zh-cn')
const bundle = fs.readFileSync('out/extension.js', 'utf8')

assert.equal(manifest.main, './out/extension.js')
assert.equal(manifest.files.includes('out/extension.js'), true)
assert.equal(manifest.files.some(file => /[*?]/u.test(file) && file.startsWith('out/')), false)
assert.match(bundle, /^\/\/ CodeBookmark 运行时打包产物/mu)
assert.doesNotMatch(bundle, /require\(["']\.\/(?:commands|config|i18n|models|providers|repository|subscriptions|util)\//u)
assert.equal(fs.statSync('out/extension.js.map').isFile(), true)

console.log('Bundled runtime contract verified: one packaged JavaScript entry point.')
