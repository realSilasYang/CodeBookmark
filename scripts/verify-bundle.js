const assert = require('node:assert/strict')
const fs = require('node:fs')

const { loadLocalizedManifest } = require('./lib/localized-manifest')

const manifest = loadLocalizedManifest('zh-cn')
const bundle = fs.readFileSync('out/extension.js', 'utf8')

assert.equal(manifest.main, './out/extension.js')
assert.equal(manifest.files.includes('out/extension.js'), true)
assert.equal(manifest.files.some(file => /[*?]/u.test(file) && file.startsWith('out/')), false)
assert.match(bundle, /^\/\/ CodeBookmark bundled runtime/mu)
assert.doesNotMatch(bundle, /require\(["']\.\/(?:commands|config|i18n|models|providers|repository|subscriptions|util)\//u)
assert.equal(fs.statSync('out/extension.js.map').isFile(), true)

console.log('Bundled runtime contract verified: one packaged JavaScript entry point.')
