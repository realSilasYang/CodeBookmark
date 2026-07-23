const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const lockfile = JSON.parse(read('package-lock.json'))

assert.equal(manifest.name, 'codebookmark')
assert.equal(manifest.displayName, '代码书签 - CodeBookmark')
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
assert.ok(manifest.keywords.every(keyword => typeof keyword === 'string' && keyword === keyword.trim() && keyword.length > 0))
assert.equal(
  new Set(manifest.keywords.map(keyword => keyword.toLocaleLowerCase())).size,
  manifest.keywords.length,
  'Marketplace keywords must be unique'
)
for (const keyword of ['bookmark', 'bookmarks', 'code bookmark', '书签', '代码书签', '标签', '代码标签']) {
  assert.ok(manifest.keywords.includes(keyword), `Marketplace keyword '${keyword}' is required for discoverability`)
}
assert.deepEqual(manifest.dependencies, {})
assert.equal(lockfile.version, manifest.version)
assert.equal(lockfile.packages[''].version, manifest.version)
assert.deepEqual(manifest.dependencies, lockfile.packages[''].dependencies ?? {})
assert.deepEqual(manifest.devDependencies, lockfile.packages[''].devDependencies ?? {})
assert.equal(manifest.devDependencies['@vscode/vsce'], '3.9.2')
assert.equal(lockfile.packages['node_modules/@vscode/vsce'].version, '3.9.2')

assert.deepEqual(manifest.files, [
  'out/extension.js',
  'resources',
  'package.nls*.json',
  'README.md',
  'docs/README.en.md',
  'CHANGELOG.md',
  'docs/CHANGELOG.en.md',
  'LICENSE',
  'docs/legal/THIRD_PARTY_NOTICES.md',
  'docs/legal/licenses',
])
assert.equal(manifest.scripts['package:list'], 'vsce ls --no-dependencies')
assert.equal(manifest.scripts['package:vsix'], 'vsce package --no-dependencies')
assert.equal(manifest.scripts.sbom, 'node scripts/release/write-sbom.js')
assert.match(manifest.scripts['test:coverage'], /--test-coverage-lines=90/)
assert.match(manifest.scripts['test:coverage'], /--test-coverage-branches=75/)
assert.match(manifest.scripts['test:coverage'], /--test-coverage-functions=85/)
assert.match(manifest.scripts['check:release'], /npm run verify/)
assert.match(manifest.scripts['check:release'], /npm run test:integration/)
assert.equal(manifest.scripts.bundle, 'node scripts/build/bundle-extension.js')
assert.match(manifest.scripts.compile, /npm run bundle/)
assert.match(manifest.scripts.compile, /tsc -p config\/tsconfig\.json/)
assert.equal(manifest.scripts['generate-package-json'], 'node scripts/build/generate-package-json.js')
assert.equal(manifest.scripts['test:integration'], 'npm run compile && node scripts/integration/run-integration-tests.js')
assert.match(manifest.scripts['check:release'], /npm audit --audit-level=low/)
assert.match(manifest.scripts['check:release'], /npm run package:list/)

const requiredSourceDocuments = [
  'README.md',
  path.join('docs', 'README.en.md'),
  'CHANGELOG.md',
  path.join('docs', 'CHANGELOG.en.md'),
  'LICENSE',
  path.join('docs', 'legal', 'THIRD_PARTY_NOTICES.md'),
  path.join('docs', 'release', 'RELEASING.md'),
  path.join('docs', 'release', 'RELEASING.en.md'),
  path.join('docs', 'release', 'CHANGELOG_TEMPLATE.md'),
  path.join('docs', 'release', 'CHANGELOG_TEMPLATE.en.md'),
  path.join('.github', 'CONTRIBUTING.md'),
  path.join('.github', 'CONTRIBUTING.en.md'),
  path.join('.github', 'SECURITY.md'),
  path.join('.github', 'SECURITY.en.md'),
  path.join('.github', 'SUPPORT.md'),
  path.join('.github', 'SUPPORT.en.md'),
  path.join('.github', 'PULL_REQUEST_TEMPLATE.md'),
  path.join('.github', 'PULL_REQUEST_TEMPLATE.en.md'),
  path.join('.github', 'dependabot.yml'),
  path.join('.github', 'ISSUE_TEMPLATE', 'bug-report--zh-cn.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'bug-report.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'feature-request--zh-cn.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'feature-request.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'improvement--zh-cn.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'improvement.md'),
  path.join('.github', 'ISSUE_TEMPLATE', 'config.yml'),
  path.join('.github', 'workflows', 'ci.yml'),
  path.join('.github', 'workflows', 'marketplace-identity.yml'),
  path.join('.github', 'workflows', 'release.yml'),
]
const requiredLicenseFiles = [
  'Apache-2.0.txt',
  'CC-BY-4.0.txt',
  'CC0-1.0.txt',
  'Flat-Color-Icons-MIT.txt',
  'Fluent-Emoji-MIT.txt',
  'VSCode-Icons-MIT.txt',
].map(file => path.join('docs', 'legal', 'licenses', file))
for (const relativePath of [...requiredSourceDocuments, ...requiredLicenseFiles]) {
  const absolutePath = path.join(root, relativePath)
  assert.equal(fs.statSync(absolutePath).isFile(), true, `${relativePath} must be a file`)
  assert.ok(fs.statSync(absolutePath).size > 0, `${relativePath} must not be empty`)
}
for (const obsoleteRootDocument of [
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'CHANGELOG.en.md',
  'README.en.md',
  'RELEASING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
]) {
  assert.equal(
    fs.existsSync(path.join(root, obsoleteRootDocument)),
    false,
    `${obsoleteRootDocument} must not remain at repository root`
  )
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
const englishChangelog = read(path.join('docs', 'CHANGELOG.en.md'))
const license = read('LICENSE')
const readme = read('README.md')
const englishReadme = read(path.join('docs', 'README.en.md'))
const notices = read(path.join('docs', 'legal', 'THIRD_PARTY_NOTICES.md'))
const icon = fs.readFileSync(path.join(root, manifest.icon))
assert.match(readme, /<h1>代码书签 - CodeBookmark<\/h1>/)
assert.match(englishReadme, /<h1>CodeBookmark<\/h1>/)
const githubDocumentUrl = 'https://github.com/realSilasYang/CodeBookmark/blob/main/'
assert.ok(readme.includes(`<a href="${githubDocumentUrl}docs/README.en.md">English</a>`))
assert.ok(englishReadme.includes(`<a href="${githubDocumentUrl}README.md">简体中文</a>`))
for (const content of [changelog, englishChangelog]) {
  assert.ok(content.includes(`[简体中文](${githubDocumentUrl}CHANGELOG.md)`))
  assert.ok(content.includes(`[English](${githubDocumentUrl}docs/CHANGELOG.en.md)`))
}
const repositoryMarkdownDocuments = [
  ['README.md', readme],
  [path.join('docs', 'README.en.md'), englishReadme],
  [path.join('docs', 'release', 'RELEASING.md'), read(path.join('docs', 'release', 'RELEASING.md'))],
  [path.join('docs', 'release', 'RELEASING.en.md'), read(path.join('docs', 'release', 'RELEASING.en.md'))],
  [path.join('.github', 'CONTRIBUTING.md'), read(path.join('.github', 'CONTRIBUTING.md'))],
  [path.join('.github', 'CONTRIBUTING.en.md'), read(path.join('.github', 'CONTRIBUTING.en.md'))],
  [path.join('.github', 'SECURITY.md'), read(path.join('.github', 'SECURITY.md'))],
  [path.join('.github', 'SECURITY.en.md'), read(path.join('.github', 'SECURITY.en.md'))],
  [path.join('.github', 'SUPPORT.md'), read(path.join('.github', 'SUPPORT.md'))],
  [path.join('.github', 'SUPPORT.en.md'), read(path.join('.github', 'SUPPORT.en.md'))],
]
for (const [documentName, content] of repositoryMarkdownDocuments) {
  const markdownLinks = [...content.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)]
  const htmlLinks = [...content.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
  for (const target of [...markdownLinks, ...htmlLinks].map(match => match[1])) {
    if (target.startsWith('#') || target.startsWith('/') || /^[A-Za-z][A-Za-z\d+.-]*:/.test(target)) continue
    const fileTarget = decodeURIComponent(target.split('#', 1)[0]).replaceAll('/', path.sep)
    const absoluteTarget = path.resolve(root, path.dirname(documentName), fileTarget)
    assert.equal(fs.existsSync(absoluteTarget), true, `${documentName} links to missing file ${target}`)
  }
}
assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
assert.ok(icon.readUInt32BE(16) >= 128, 'Marketplace icon width must be at least 128 px')
assert.ok(icon.readUInt32BE(20) >= 128, 'Marketplace icon height must be at least 128 px')
assert.match(
  changelog,
  new RegExp(`^## 🎉 版本 ${manifest.version.replace(/\./g, '\\.')} - \\d{4}-\\d{2}-\\d{2}$`, 'm'),
)
assert.match(changelog, /^# 📋 更新日志$/m)
assert.match(
  englishChangelog,
  new RegExp(`^## 🎉 Version ${manifest.version.replace(/\./g, '\\.') } - \\d{4}-\\d{2}-\\d{2}$`, 'm'),
)
assert.match(englishChangelog, /^# 📋 Changelog$/m)
assert.doesNotMatch(changelog, /^### (?:Added|Changed|Fixed|Removed|Security)$/m)
assert.doesNotMatch(changelog, /语义化版本|新增版本时请使用|中文更新日志模板/)
assert.doesNotMatch(englishChangelog, /Semantic Versioning|For a new release|English changelog template/)
assert.doesNotMatch(changelog, /^### ⚠(?!️)/m)
assert.doesNotMatch(englishChangelog, /^### ⚠(?!️)/m)
assert.match(license, /Copyright \(c\) 2026 阳熙来/)
assert.match(readme, /\[发布指南\]\(https:\/\/github\.com\/realSilasYang\/CodeBookmark\/blob\/main\/docs\/release\/RELEASING\.md\)/)
assert.match(englishReadme, /\[English release guide\]\(https:\/\/github\.com\/realSilasYang\/CodeBookmark\/blob\/main\/docs\/release\/RELEASING\.en\.md\)/)
assert.match(notices, /`fxemoji`[^\n]+CC-BY-4\.0/)
for (const [documentName, content] of [['README.md', readme], ['docs/README.en.md', englishReadme], ['CHANGELOG.md', changelog], ['docs/CHANGELOG.en.md', englishChangelog]]) {
  const markdownImages = [...content.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)]
  const htmlImages = [...content.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  for (const target of [...markdownImages, ...htmlImages].map(match => match[1])) {
    assert.doesNotMatch(target, /^http:\/\//i, `${documentName} image URLs must use HTTPS`)
    assert.doesNotMatch(target, /\.svg(?:[?#].*)?$/i, `${documentName} must not embed SVG images`)
  }
}
for (const licenseFile of requiredLicenseFiles) {
  const noticePath = `licenses/${path.basename(licenseFile)}`
  assert.match(notices, new RegExp(noticePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
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
assert.match(ci, /CODEBOOKMARK_ALLOW_VSCODE_DOWNLOAD: 'true'/)
assert.match(ci, /CODEBOOKMARK_VSCODE_TEST_VERSION: '1\.130\.0'/)
assert.match(ci, /npm audit --audit-level=low/)
assert.match(ci, /npm run package:vsix/)
const dependabot = read(path.join('.github', 'dependabot.yml'))
assert.match(dependabot, /package-ecosystem: npm[\s\S]*dependency-name: typescript[\s\S]*">=7\.0\.0 <8\.0\.0"/)
const releaseWorkflow = read(path.join('.github', 'workflows', 'release.yml'))
const marketplaceIdentityWorkflow = read(
  path.join('.github', 'workflows', 'marketplace-identity.yml')
)
for (const workflowPath of [
  path.join('.github', 'workflows', 'ci.yml'),
  path.join('.github', 'workflows', 'marketplace-identity.yml'),
  path.join('.github', 'workflows', 'release.yml'),
]) {
  const workflow = read(workflowPath)
  const uses = [...workflow.matchAll(/^\s*-?\s*uses:\s+([^\s#]+)/gm)].map(match => match[1])
  assert.ok(uses.length > 0, `${workflowPath} must use at least one pinned action`)
  for (const action of uses) {
    assert.match(action, /^[^@\s]+@[0-9a-f]{40}$/, `${workflowPath} contains an unpinned action: ${action}`)
  }
}
assert.match(marketplaceIdentityWorkflow, /workflow_dispatch:/)
assert.match(marketplaceIdentityWorkflow, /verify_marketplace_access:/)
assert.match(marketplaceIdentityWorkflow, /environment: marketplace-release/)
assert.match(marketplaceIdentityWorkflow, /id-token: write/)
assert.match(marketplaceIdentityWorkflow, /uses: azure\/login@[0-9a-f]{40} # v3/)
assert.match(marketplaceIdentityWorkflow, /app\.vssps\.visualstudio\.com\/_apis\/profile\/profiles\/me/)
assert.match(marketplaceIdentityWorkflow, /499b84ac-1321-427f-aa17-267ca6975798/)
assert.match(marketplaceIdentityWorkflow, /GITHUB_STEP_SUMMARY/)
assert.match(marketplaceIdentityWorkflow, /npm ci/)
assert.match(marketplaceIdentityWorkflow, /npm exec -- vsce verify-pat --azure-credential/)
assert.doesNotMatch(marketplaceIdentityWorkflow, /\bnpx\b/)
assert.match(marketplaceIdentityWorkflow, /VSCODE_MARKETPLACE_PUBLISHER/)
assert.doesNotMatch(marketplaceIdentityWorkflow, /VSCE_PAT|secrets\.|--pat\b/)
assert.match(
  read(path.join('docs', 'release', 'RELEASING.md')),
  /repo:realSilasYang@64590265\/CodeBookmark@1308408396:environment:marketplace-release/
)
assert.match(releaseWorkflow, /tags:[\s\S]*- v\*/)
assert.match(releaseWorkflow, /GITHUB_REF_NAME/)
assert.match(releaseWorkflow, /VSCODE_MARKETPLACE_PUBLISHER/)
assert.match(releaseWorkflow, /CONFIRMED_PUBLISHER/)
assert.match(releaseWorkflow, /environment: marketplace-release/)
assert.match(releaseWorkflow, /attestations: write/)
assert.match(releaseWorkflow, /id-token: write/)
assert.match(releaseWorkflow, /uses: azure\/login@[0-9a-f]{40} # v3/)
for (const variableName of ['AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_SUBSCRIPTION_ID']) {
  assert.match(releaseWorkflow, new RegExp(`\\b${variableName}\\b`))
}
assert.match(releaseWorkflow, /\[Guid\]::Parse/)
assert.match(releaseWorkflow, /npm run test:integration/)
assert.match(releaseWorkflow, /npm exec -- vsce publish/)
assert.doesNotMatch(releaseWorkflow, /\bnpx\b/)
assert.match(releaseWorkflow, /--azure-credential/)
assert.match(releaseWorkflow, /--packagePath/)
assert.match(releaseWorkflow, /--skip-duplicate/)
assert.doesNotMatch(releaseWorkflow, /VSCE_PAT/)
assert.doesNotMatch(releaseWorkflow, /secrets\./)
assert.doesNotMatch(releaseWorkflow, /--pat\b/)
assert.match(releaseWorkflow, /_apis\/public\/gallery\/publishers/)
assert.match(releaseWorkflow, /Get-FileHash -Algorithm SHA256/)
assert.match(releaseWorkflow, /fetch-depth: 0/)
assert.match(releaseWorkflow, /git cat-file -t \$env:GITHUB_REF_NAME/)
assert.match(releaseWorkflow, /git merge-base --is-ancestor \$tagCommit origin\/main/)
assert.match(releaseWorkflow, /npm run sbom -- \$sbom/)
assert.match(releaseWorkflow, /write-sha256sums\.js SHA256SUMS/)
assert.match(releaseWorkflow, /actions\/attest-build-provenance@[0-9a-f]{40} # v3/)
assert.match(releaseWorkflow, /actions\/attest-sbom@[0-9a-f]{40} # v3/)
assert.match(releaseWorkflow, /scripts\/release\/build-release-notes\.js/)
assert.match(releaseWorkflow, /CODEBOOKMARK_ALLOW_VSCODE_DOWNLOAD: 'true'/)
assert.match(releaseWorkflow, /CODEBOOKMARK_VSCODE_TEST_VERSION: '1\.130\.0'/)
assert.match(releaseWorkflow, /--notes-file/)
assert.match(releaseWorkflow, /gh release edit/)
assert.match(releaseWorkflow, /gh release create/)
assert.match(releaseWorkflow, /gh release upload/)
assert.match(releaseWorkflow, /\$vsix \$sbom SHA256SUMS --clobber/)
assert.match(releaseWorkflow, /\$vsix \$sbom SHA256SUMS `/)
assert.doesNotMatch(releaseWorkflow, /--generate-notes/)
assert.match(releaseWorkflow, /group: release/)
const publishStep = releaseWorkflow.indexOf('Publish to VS Code Marketplace')
const authenticateStep = releaseWorkflow.indexOf('Authenticate to Microsoft Entra ID')
const releaseNotesStep = releaseWorkflow.indexOf('Build Chinese release notes')
const verifyStep = releaseWorkflow.indexOf('Verify Marketplace package matches VSIX')
const createReleaseStep = releaseWorkflow.indexOf('Create or update GitHub release')
assert.ok(
  authenticateStep !== -1 && publishStep !== -1 && authenticateStep < publishStep,
  'Microsoft Entra ID authentication must complete before Marketplace publication'
)
assert.ok(
  releaseNotesStep !== -1 && publishStep !== -1 && releaseNotesStep < publishStep,
  'Chinese release notes must be validated before Marketplace publication'
)
assert.ok(
  publishStep !== -1 && createReleaseStep !== -1 && publishStep < createReleaseStep,
  'Marketplace publication must complete before the GitHub release is created'
)
assert.ok(
  verifyStep !== -1 && createReleaseStep !== -1 && verifyStep < createReleaseStep,
  'Marketplace package verification must complete before the GitHub release is created'
)

console.log('Release readiness contract verified.')
