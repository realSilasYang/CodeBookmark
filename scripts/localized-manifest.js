const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function isChineseLanguage(language) {
  return language === undefined || language === '' || /^zh(?:[-_]|$)/i.test(language)
}

function resolveLocalizedValue(value, messages) {
  if (typeof value === 'string') {
    const match = /^%([^%]+)%$/.exec(value)
    if (!match) return value
    if (!(match[1] in messages)) throw new Error(`Missing manifest localization message: ${match[1]}`)
    return messages[match[1]]
  }
  if (Array.isArray(value)) return value.map(item => resolveLocalizedValue(item, messages))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, resolveLocalizedValue(item, messages)]))
  }
  return value
}

function loadLocalizedManifest(language = 'zh-cn') {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const localizationFile = isChineseLanguage(language) ? 'package.nls.zh-cn.json' : 'package.nls.json'
  const messages = JSON.parse(fs.readFileSync(path.join(root, localizationFile), 'utf8'))
  return resolveLocalizedValue(manifest, messages)
}

module.exports = { isChineseLanguage, loadLocalizedManifest, resolveLocalizedValue }
