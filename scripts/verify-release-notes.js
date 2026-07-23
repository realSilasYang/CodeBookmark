const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')

const root = path.resolve(__dirname, '..')
const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const template = fs.readFileSync(path.join(root, 'docs', 'release', 'CHANGELOG_TEMPLATE.md'), 'utf8')
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-release-notes-'))

try {
  assert.match(changelog, /^# 📋 更新日志$/m)
  assert.match(changelog, new RegExp(`^## 🎉 版本 ${manifest.version.replace(/\./g, '\\.')} - \\d{4}-\\d{2}-\\d{2}$`, 'm'))
  assert.doesNotMatch(changelog, /^### (?:Added|Changed|Fixed|Removed|Security)$/m)
  assert.match(template, /^# 📝 中文更新日志模板$/m)
  for (const heading of ['## 🎉 版本 X.Y.Z - YYYY-MM-DD', '### ⚠️ 重要说明', '### ✨ 新增', '### 🚀 优化', '### 🐛 修复']) {
    assert.ok(template.includes(heading), `更新日志模板缺少结构：${heading}`)
  }
  assert.ok(
    template.indexOf('### ⚠️ 重要说明') < template.indexOf('### ✨ 新增'),
    '重要说明必须是模板中的第一个版本分类',
  )

  const versions = [...changelog.matchAll(/^## 🎉 版本 (\S+) - \d{4}-\d{2}-\d{2}$/gm)].map(match => match[1])
  assert.ok(versions.includes(manifest.version))
  assert.equal(new Set(versions).size, versions.length)
  for (const version of versions) {
    const outputFile = path.join(sandbox, `release-notes-${version}.md`)
    childProcess.execFileSync(
      process.execPath,
      [path.join(root, 'scripts', 'release', 'build-release-notes.js'), version, outputFile],
      { cwd: root, stdio: 'pipe' },
    )
    const releaseNotes = fs.readFileSync(outputFile, 'utf8')
    assert.match(releaseNotes, new RegExp(`^# 🎉 CodeBookmark v${version.replace(/\./g, '\\.')} 更新日志$`, 'm'))
    assert.match(releaseNotes, /^## (?:⚠️ 重要说明|✨ 新增|🚀 优化|🐛 修复)$/m)
    const importantNotesIndex = releaseNotes.indexOf('## ⚠️ 重要说明')
    if (importantNotesIndex >= 0) {
      const firstCategoryIndex = releaseNotes.search(/^## /m)
      assert.equal(importantNotesIndex, firstCategoryIndex, `版本 ${version} 的重要说明必须排在首位`)
    }
    assert.doesNotMatch(releaseNotes, /^### /m)
    assert.doesNotMatch(releaseNotes, /\{\{|X\.Y\.Z|YYYY-MM-DD/)
  }
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true })
}

console.log('Chinese release notes contract verified.')
