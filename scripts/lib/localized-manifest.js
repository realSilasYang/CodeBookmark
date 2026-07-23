/**
 * 模块说明：本文件负责构建脚本共享基础设施，具体对象为 `localized-manifest`。
 *
 * 实现要点：集中复用清单本地化与生成规则，避免多个构建入口产生不一致结果。
 * 核心边界：脚本失败时应以非零状态退出，且不得静默改写不属于本任务的用户文件。
 * 主要入口：`isChineseLanguage`、`resolveLocalizedValue`、`localizationFile`、`loadLocalizedManifest`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')

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

function localizationFile(language) {
  const normalized = String(language ?? '').trim().toLowerCase().replaceAll('_', '-')
  const candidates = []
  if (normalized) {
    candidates.push(`package.nls.${normalized}.json`)
    const separator = normalized.lastIndexOf('-')
    if (separator > 0) candidates.push(`package.nls.${normalized.slice(0, separator)}.json`)
  }
  return candidates.find(fileName => fs.existsSync(path.join(root, fileName)))
}

function loadLocalizedManifest(language = 'zh-cn') {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const defaultMessages = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8'))
  const localizedFile = localizationFile(language)
  const localizedMessages = localizedFile
    ? JSON.parse(fs.readFileSync(path.join(root, localizedFile), 'utf8'))
    : {}
  const messages = { ...defaultMessages, ...localizedMessages }
  return resolveLocalizedValue(manifest, messages)
}

module.exports = { isChineseLanguage, loadLocalizedManifest, resolveLocalizedValue }
