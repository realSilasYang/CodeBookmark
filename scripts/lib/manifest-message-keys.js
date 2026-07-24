/**
 * 为扩展清单中的可翻译字段生成不依赖数组顺序的稳定键。
 * 命令、视图和子菜单优先使用公开身份，缺少身份的结构则使用排除文案后的内容摘要。
 */
const crypto = require('node:crypto')

function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/g, '_')
}

function structuralIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value.command ?? value.id ?? value.submenu ?? value.view
}

function structuralHash(value) {
  const ignored = new Set(['title', 'name', 'description', 'contents', 'category'])
  const normalized = Object.fromEntries(Object.entries(value)
    .filter(([key]) => !ignored.has(key))
    .sort(([left], [right]) => left.localeCompare(right, 'en')))
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 10)
}

function arraySegments(items) {
  const identities = items.map(structuralIdentity)
  return items.map((item, index) => {
    const identity = identities[index]
    if (identity === undefined) return items.length === 1 ? 'main' : `item-${structuralHash(item)}`
    const duplicate = identities.filter(candidate => candidate === identity).length > 1
    return safeSegment(duplicate ? `${identity}-${structuralHash(item)}` : identity)
  })
}

function manifestMessageKey(pathSegments) {
  return `codebookmark.${pathSegments.map(safeSegment).join('.')}`
}

module.exports = { arraySegments, manifestMessageKey }
