const fs = require('node:fs')
const path = require('node:path')

function fail(message) {
  console.error(message)
  process.exit(1)
}

const [, , version, outputFile] = process.argv
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || '')) {
  fail('用法：node scripts/release/build-release-notes.js <版本号> <输出文件>')
}
if (!outputFile) fail('必须指定更新日志输出文件。')

const root = path.resolve(__dirname, '../..')
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n')
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const versionPattern = new RegExp(
  `^## 🎉 版本 ${escapedVersion} - \\d{4}-\\d{2}-\\d{2}\\n([\\s\\S]*?)(?=^## 🎉 版本 |(?![\\s\\S]))`,
  'm',
)
const match = changelog.match(versionPattern)
if (!match) fail(`CHANGELOG.md 中缺少版本 ${version} 的规范更新日志。`)

const changes = match[1].trim()
const allowedCategories = new Set(['⚠️ 重要说明', '✨ 新增', '🚀 优化', '🐛 修复'])
const categories = [...changes.matchAll(/^### (.+)$/gm)].map(category => category[1])
if (categories.length === 0) {
  fail(`版本 ${version} 至少需要一个规范的中文更新分类。`)
}
const unsupportedCategory = categories.find(category => !allowedCategories.has(category))
if (unsupportedCategory) {
  fail(`版本 ${version} 包含不受支持的更新分类：${unsupportedCategory}`)
}
if (new Set(categories).size !== categories.length) {
  fail(`版本 ${version} 包含重复的更新分类。`)
}
const importantNotesIndex = categories.indexOf('⚠️ 重要说明')
if (importantNotesIndex > 0) {
  fail(`版本 ${version} 的重要说明必须放在版本内容首位。`)
}

const releaseSections = changes.replace(/^### /gm, '## ')
const artifactNotes = [
  '## 📦 发布文件说明',
  '',
  `- \`codebookmark-${version}.vsix\`：VS Code 扩展离线安装包。`,
  `- \`codebookmark-${version}.sbom.cdx.json\`：软件物料清单（SBOM），用于核查发布包中的组件与依赖。`,
  '- `SHA256SUMS`：发布文件的 SHA-256 校验值，用于验证下载内容是否完整且未经更改。',
].join('\n')
const releaseNotes = `# 🎉 CodeBookmark v${version} 更新日志\n\n${releaseSections}\n\n${artifactNotes}\n`
fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true })
fs.writeFileSync(outputFile, releaseNotes, 'utf8')
console.log(`已生成中文 Release 更新日志：${outputFile}`)
