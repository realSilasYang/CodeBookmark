const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const manifest = JSON.parse(read('package.json'))
const lockfile = JSON.parse(read('package-lock.json'))

assert.equal(manifest.name, 'codebookmark')
assert.equal(manifest.displayName, 'CodeBookmark')
assert.equal(manifest.author, '阳熙来')
assert.equal(manifest.private, true, 'private must prevent accidental npm publication')
assert.equal(manifest.license, 'MIT')
assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/)
assert.match(manifest.publisher, /^[A-Za-z0-9][A-Za-z0-9-]*$/)
assert.deepEqual(manifest.repository, {
  type: 'git',
  url: 'https://github.com/realSilasYang/CodeBookmark.git',
})
assert.equal(manifest.homepage, 'https://github.com/realSilasYang/CodeBookmark#readme')
assert.equal(manifest.bugs?.url, 'https://github.com/realSilasYang/CodeBookmark/issues')
assert.equal(manifest.icon, 'resources/bookmark_logo.png')
assert.deepEqual(manifest.galleryBanner, { color: '#252526', theme: 'dark' })
assert.equal(manifest.pricing, 'Free')
assert.ok(manifest.keywords.length <= 30)
assert.deepEqual(manifest.dependencies, {})
assert.equal(lockfile.version, manifest.version)
assert.equal(lockfile.packages[''].version, manifest.version)
assert.deepEqual(manifest.dependencies, lockfile.packages[''].dependencies ?? {})
assert.deepEqual(manifest.devDependencies, lockfile.packages[''].devDependencies ?? {})

assert.deepEqual(manifest.files, [
  'out/**/*.js',
  'resources',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_LICENSES',
])
assert.equal(manifest.scripts['package:list'], 'npx --yes @vscode/vsce@3.9.2 ls --no-dependencies')
assert.equal(manifest.scripts['package:vsix'], 'npx --yes @vscode/vsce@3.9.2 package --no-dependencies')
assert.match(manifest.scripts['check:release'], /npm run verify/)
assert.match(manifest.scripts['check:release'], /npm run test:integration/)
assert.match(manifest.scripts['check:release'], /npm audit --audit-level=high/)
assert.match(manifest.scripts['check:release'], /npm run package:list/)

const requiredSourceDocuments = [
  'README.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'RELEASING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
  path.join('.github', 'PULL_REQUEST_TEMPLATE.md'),
  path.join('.github', 'dependabot.yml'),
  path.join('.github', 'ISSUE_TEMPLATE', 'bug-report--zh-cn.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'bug-report.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'feature-request--zh-cn.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'feature-request.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'improvement--zh-cn.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'improvement.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'config.yml'),
  path.join('.github', 'workflows', 'ci.yml'),
  path.join('.github', 'workflows', 'release.yml'),
]
const requiredLicenseFiles = [
  'Apache-2.0.txt',
  'CC-BY-4.0.txt',
  'CC0-1.0.txt',
  'Flat-Color-Icons-MIT.txt',
  'Fluent-Emoji-MIT.txt',
  'VSCode-Icons-MIT.txt',
].map(file => path.join('THIRD_PARTY_LICENSES', file))
for (const relativePath of [...requiredSourceDocuments, ...requiredLicenseFiles]) {
  const absolutePath = path.join(root, relativePath)
  assert.equal(fs.statSync(absolutePath).isFile(), true, `${relativePath} must be a file`)
  assert.ok(fs.statSync(absolutePath).size > 0, `${relativePath} must not be empty`)
}

const issueTemplateContracts = [
  ['bug-report--zh-cn.md', '[BUG]', 'bug'],
  ['bug-report.md', '[BUG]', 'bug'],
  ['feature-request--zh-cn.md', '[FEATURE]', 'enhancement'],
  ['feature-request.md', '[FEATURE]', 'enhancement'],
  ['improvement--zh-cn.md', '[IMPROVEMENT]', 'enhancement'],
  ['improvement.md', '[IMPROVEMENT]', 'enhancement'],
]
for (const [fileName, title, label] of issueTemplateContracts) {
  const content = read(path.join('.github', 'ISSUE_TEMPLATE', fileName))
  const frontMatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert.ok(frontMatter, `${fileName} must contain YAML front matter`)
  assert.match(frontMatter[1], /^name: .+$/m)
  assert.match(frontMatter[1], /^about: .+$/m)
  assert.ok(frontMatter[1].split(/\r?\n/).includes(`title: '${title} '`), `${fileName} must use the ${title} title prefix`)
  assert.ok(frontMatter[1].split(/\r?\n/).includes(`labels: ${label}`), `${fileName} must use the ${label} label`)
}
const issueTemplateConfig = read(path.join('.github', 'ISSUE_TEMPLATE', 'config.yml'))
assert.match(issueTemplateConfig, /^blank_issues_enabled: false$/m)
assert.match(issueTemplateConfig, /\/security\/advisories\/new/)

const changelog = read('CHANGELOG.md')
const license = read('LICENSE')
const readme = read('README.md')
const notices = read('THIRD_PARTY_NOTICES.md')
const icon = fs.readFileSync(path.join(root, manifest.icon))
assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
assert.ok(icon.readUInt32BE(16) >= 128, 'Marketplace icon width must be at least 128 px')
assert.ok(icon.readUInt32BE(20) >= 128, 'Marketplace icon height must be at least 128 px')
assert.match(changelog, new RegExp(`^## ${manifest.version.replace(/\./g, '\\.')}\\b`, 'm'))
assert.match(license, /Copyright \(c\) 2026 阳熙来/)
assert.match(readme, /\[RELEASING\.md\]\(RELEASING\.md\)/)
assert.match(notices, /`fxemoji`[^\n]+CC-BY-4\.0/)
for (const [documentName, content] of [['README.md', readme], ['CHANGELOG.md', changelog]]) {
  const markdownImages = [...content.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)]
  const htmlImages = [...content.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  for (const target of [...markdownImages, ...htmlImages].map(match => match[1])) {
    assert.doesNotMatch(target, /^http:\/\//i, `${documentName} image URLs must use HTTPS`)
    assert.doesNotMatch(target, /\.svg(?:[?#].*)?$/i, `${documentName} must not embed SVG images`)
  }
}
for (const licenseFile of requiredLicenseFiles) {
  assert.match(notices, new RegExp(licenseFile.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

const gitignore = read('.gitignore')
for (const ignored of ['out/', '*.vsix', 'node_modules/', '.vscode-test/', '.env', '.env.*']) {
  assert.ok(gitignore.split(/\r?\n/).includes(ignored), `.gitignore must include ${ignored}`)
}
const ci = read(path.join('.github', 'workflows', 'ci.yml'))
assert.match(ci, /push:\s*\r?\n\s+branches:\s*\r?\n\s+- main/)
assert.match(ci, /pull_request:/)
assert.match(ci, /npm run verify/)
assert.match(ci, /npm run test:integration/)
assert.match(ci, /npm audit --audit-level=high/)
assert.match(ci, /npm run package:vsix/)
const dependabot = read(path.join('.github', 'dependabot.yml'))
assert.match(dependabot, /package-ecosystem: npm[\s\S]*dependency-name: typescript[\s\S]*">=7\.0\.0 <8\.0\.0"/)
const releaseWorkflow = read(path.join('.github', 'workflows', 'release.yml'))
assert.match(releaseWorkflow, /tags:[\s\S]*- v\*/)
assert.match(releaseWorkflow, /GITHUB_REF_NAME/)
assert.match(releaseWorkflow, /VSCODE_MARKETPLACE_PUBLISHER/)
assert.match(releaseWorkflow, /CONFIRMED_PUBLISHER/)
assert.match(releaseWorkflow, /npm run test:integration/)
assert.match(releaseWorkflow, /gh release create/)

console.log('Release readiness contract verified.')
