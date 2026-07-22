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

assert.deepEqual(manifest.files, [
  'out/**/*.js',
  'resources',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
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
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  path.join('docs', 'RELEASING.md'),
  path.join('.github', 'CONTRIBUTING.md'),
  path.join('.github', 'SECURITY.md'),
  path.join('.github', 'SUPPORT.md'),
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
].map(file => path.join('THIRD_PARTY_LICENSES', file))
for (const relativePath of [...requiredSourceDocuments, ...requiredLicenseFiles]) {
  const absolutePath = path.join(root, relativePath)
  assert.equal(fs.statSync(absolutePath).isFile(), true, `${relativePath} must be a file`)
  assert.ok(fs.statSync(absolutePath).size > 0, `${relativePath} must not be empty`)
}
for (const obsoleteRootDocument of [
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'RELEASING.md',
  'SECURITY.md',
  'SUPPORT.md',
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
const license = read('LICENSE')
const readme = read('README.md')
const notices = read('THIRD_PARTY_NOTICES.md')
const icon = fs.readFileSync(path.join(root, manifest.icon))
const repositoryMarkdownDocuments = [
  ['README.md', readme],
  [path.join('docs', 'RELEASING.md'), read(path.join('docs', 'RELEASING.md'))],
  [path.join('.github', 'CONTRIBUTING.md'), read(path.join('.github', 'CONTRIBUTING.md'))],
  [path.join('.github', 'SECURITY.md'), read(path.join('.github', 'SECURITY.md'))],
  [path.join('.github', 'SUPPORT.md'), read(path.join('.github', 'SUPPORT.md'))],
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
assert.match(changelog, new RegExp(`^## ${manifest.version.replace(/\./g, '\\.')}\\b`, 'm'))
assert.match(license, /Copyright \(c\) 2026 阳熙来/)
assert.match(readme, /\[发布指南\]\(https:\/\/github\.com\/realSilasYang\/CodeBookmark\/blob\/main\/docs\/RELEASING\.md\)/)
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
const marketplaceIdentityWorkflow = read(
  path.join('.github', 'workflows', 'marketplace-identity.yml')
)
assert.match(marketplaceIdentityWorkflow, /workflow_dispatch:/)
assert.match(marketplaceIdentityWorkflow, /verify_marketplace_access:/)
assert.match(marketplaceIdentityWorkflow, /environment: marketplace-release/)
assert.match(marketplaceIdentityWorkflow, /id-token: write/)
assert.match(marketplaceIdentityWorkflow, /uses: azure\/login@v3/)
assert.match(marketplaceIdentityWorkflow, /app\.vssps\.visualstudio\.com\/_apis\/profile\/profiles\/me/)
assert.match(marketplaceIdentityWorkflow, /499b84ac-1321-427f-aa17-267ca6975798/)
assert.match(marketplaceIdentityWorkflow, /GITHUB_STEP_SUMMARY/)
assert.match(marketplaceIdentityWorkflow, /@vscode\/vsce@3\.9\.2 verify-pat --azure-credential/)
assert.match(marketplaceIdentityWorkflow, /VSCODE_MARKETPLACE_PUBLISHER/)
assert.doesNotMatch(marketplaceIdentityWorkflow, /VSCE_PAT|secrets\.|--pat\b/)
assert.match(
  read(path.join('docs', 'RELEASING.md')),
  /repo:realSilasYang@64590265\/CodeBookmark@1308408396:environment:marketplace-release/
)
assert.match(releaseWorkflow, /tags:[\s\S]*- v\*/)
assert.match(releaseWorkflow, /GITHUB_REF_NAME/)
assert.match(releaseWorkflow, /VSCODE_MARKETPLACE_PUBLISHER/)
assert.match(releaseWorkflow, /CONFIRMED_PUBLISHER/)
assert.match(releaseWorkflow, /environment: marketplace-release/)
assert.match(releaseWorkflow, /id-token: write/)
assert.match(releaseWorkflow, /uses: azure\/login@v3/)
for (const variableName of ['AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_SUBSCRIPTION_ID']) {
  assert.match(releaseWorkflow, new RegExp(`\\b${variableName}\\b`))
}
assert.match(releaseWorkflow, /\[Guid\]::Parse/)
assert.match(releaseWorkflow, /npm run test:integration/)
assert.match(releaseWorkflow, /@vscode\/vsce@3\.9\.2 publish/)
assert.match(releaseWorkflow, /--azure-credential/)
assert.match(releaseWorkflow, /--packagePath/)
assert.match(releaseWorkflow, /--skip-duplicate/)
assert.doesNotMatch(releaseWorkflow, /VSCE_PAT/)
assert.doesNotMatch(releaseWorkflow, /secrets\./)
assert.doesNotMatch(releaseWorkflow, /--pat\b/)
assert.match(releaseWorkflow, /_apis\/public\/gallery\/publishers/)
assert.match(releaseWorkflow, /Get-FileHash -Algorithm SHA256/)
assert.match(releaseWorkflow, /gh release create/)
assert.match(releaseWorkflow, /gh release upload/)
assert.match(releaseWorkflow, /group: release/)
const publishStep = releaseWorkflow.indexOf('Publish to VS Code Marketplace')
const authenticateStep = releaseWorkflow.indexOf('Authenticate to Microsoft Entra ID')
const verifyStep = releaseWorkflow.indexOf('Verify Marketplace package matches VSIX')
const createReleaseStep = releaseWorkflow.indexOf('Create or update GitHub release')
assert.ok(
  authenticateStep !== -1 && publishStep !== -1 && authenticateStep < publishStep,
  'Microsoft Entra ID authentication must complete before Marketplace publication'
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
