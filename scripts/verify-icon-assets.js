/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-icon-assets`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-icon-assets` 对应契约。
 * 核心边界：通过断言锁定“verify-icon-assets”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const iconsDir = path.join(root, 'resources', 'custom_icons')
const dictionaryPath = path.join(root, 'resources', 'icon_dictionary.json')
const curatedPath = path.join(root, 'scripts', 'icons', 'curated_icons.json')
const dictionary = JSON.parse(fs.readFileSync(dictionaryPath, 'utf8'))
const curated = JSON.parse(fs.readFileSync(curatedPath, 'utf8'))
const files = fs.readdirSync(iconsDir).filter(file => file.endsWith('.svg'))
const iconIdPattern = /^(status|arch|ui|fun|brand)_[a-z0-9][a-z0-9_-]*\.svg$/
const chineseKeywordPattern = /\p{Script=Han}/u
const hasUnsafeText = value => /[<>&"']/.test(value) || Array.from(value).some(character => character.charCodeAt(0) < 32)

const invalidDictionaryEntries = dictionary.filter(icon =>
  !icon || typeof icon !== 'object'
  || typeof icon.id !== 'string' || !iconIdPattern.test(icon.id)
  || typeof icon.name !== 'string' || icon.name.length === 0 || icon.name.length > 120 || hasUnsafeText(icon.name)
  || (icon.keywords !== undefined && (!Array.isArray(icon.keywords) || icon.keywords.some(keyword =>
    typeof keyword !== 'string' || keyword.length === 0 || keyword.length > 120 || hasUnsafeText(keyword)
  )))
)
const invalidCuratedEntries = curated.icons.filter(icon =>
  !icon || typeof icon !== 'object'
  || typeof icon.name !== 'string' || !iconIdPattern.test(icon.name)
  || typeof icon.url !== 'string' || !icon.url.startsWith('https://')
)

const dictionaryIds = dictionary.map(icon => icon.id)
const duplicateIds = dictionaryIds.filter((id, index) => dictionaryIds.indexOf(id) !== index)
const fileSet = new Set(files)
const dictionarySet = new Set(dictionaryIds)
const missingFiles = [...dictionarySet].filter(id => !fileSet.has(id))
const unindexedFiles = files.filter(file => !dictionarySet.has(file))
const invalidSvgFiles = files.filter(file => {
  const svg = fs.readFileSync(path.join(iconsDir, file), 'utf8')
  return !/<svg(?:\s|>)/i.test(svg)
    || /<script(?:\s|>)|<foreignObject(?:\s|>)|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?:javascript:|data:|https?:)/i.test(svg)
})
const curatedNames = curated.icons.map(icon => icon.name)
const duplicateCuratedNames = curatedNames.filter((name, index) => curatedNames.indexOf(name) !== index)
const numberedVariantNames = [...files, ...dictionaryIds, ...curatedNames]
  .filter(name => /_v\d+\.svg$/i.test(name))
const insufficientChineseKeywords = dictionary
  .map(icon => ({
    id: icon.id,
    name: icon.name,
    count: Array.isArray(icon.keywords)
      ? icon.keywords.filter(keyword => typeof keyword === 'string' && chineseKeywordPattern.test(keyword)).length
      : 0,
  }))
  .filter(icon => icon.count < 5)

if (duplicateIds.length || missingFiles.length || unindexedFiles.length || invalidSvgFiles.length || duplicateCuratedNames.length || numberedVariantNames.length || invalidDictionaryEntries.length || invalidCuratedEntries.length || insufficientChineseKeywords.length) {
  console.error(JSON.stringify({
    duplicateIds,
    missingFiles,
    unindexedFiles,
    invalidSvgFiles,
    duplicateCuratedNames,
    numberedVariantNames,
    invalidDictionaryEntries,
    invalidCuratedEntries,
    insufficientChineseKeywords,
  }, null, 2))
  process.exitCode = 1
} else {
  if (curated.total !== curated.icons.length) throw new Error('curated icon total does not match its entries')
  console.log(`Verified ${files.length} icon files and dictionary entries.`)
}
