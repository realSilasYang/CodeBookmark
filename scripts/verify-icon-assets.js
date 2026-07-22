const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const iconsDir = path.join(root, 'resources', 'custom_icons')
const dictionaryPath = path.join(root, 'resources', 'icon_dictionary.json')
const curatedPath = path.join(root, 'scripts', 'icon_tools', 'curated_icons.json')
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
