const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const rootFiles = new Set([
  '.gitattributes',
  '.gitignore',
  '.nvmrc',
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'package-lock.json',
  'package.json',
])
const rootDirectories = new Set([
  '.git',
  '.github',
  '.vscode',
  '.vscode-test',
  'config',
  'coverage',
  'docs',
  'node_modules',
  'out',
  'resources',
  'scripts',
  'src',
  'tests',
])
const isGeneratedLocalization = name => /^package\.nls(?:\.[a-z]{2}(?:-[a-z]{2})?)?\.json$/i.test(name)

const unexpectedRootEntries = fs.readdirSync(root, { withFileTypes: true })
  .filter(entry => {
    if (entry.isDirectory()) return !rootDirectories.has(entry.name)
    return !rootFiles.has(entry.name) && !isGeneratedLocalization(entry.name)
  })
  .map(entry => entry.name)
assert.deepEqual(
  unexpectedRootEntries,
  [],
  `Repository root contains misplaced entries: ${unexpectedRootEntries.join(', ')}`
)

const requiredPaths = [
  'config/eslint.config.mjs',
  'config/tsconfig.json',
  'docs/README.en.md',
  'docs/CHANGELOG.en.md',
  'docs/legal/THIRD_PARTY_NOTICES.md',
  'docs/legal/licenses/Apache-2.0.txt',
  'docs/release/CHANGELOG_TEMPLATE.md',
  'docs/release/CHANGELOG_TEMPLATE.en.md',
  'docs/release/RELEASING.md',
  'docs/release/RELEASING.en.md',
  'scripts/build/bundle-extension.js',
  'scripts/build/clean-output.js',
  'scripts/build/generate-package-json.js',
  'scripts/icons/curated_icons.json',
  'scripts/integration/run-integration-tests.js',
  'scripts/lib/localized-manifest.js',
  'scripts/lib/manifest-localizations.js',
  'scripts/release/build-release-notes.js',
  'scripts/release/write-sbom.js',
  'scripts/release/write-sha256sums.js',
  'tests/integration/fixture/sample.ts',
  'tests/integration/suite/index.js',
]
for (const relativePath of requiredPaths) {
  assert.equal(fs.statSync(path.join(root, relativePath)).isFile(), true, `${relativePath} must be a file`)
}

const obsoletePaths = [
  'CHANGELOG.en.md',
  'README.en.md',
  'THIRD_PARTY_LICENSES',
  'THIRD_PARTY_NOTICES.md',
  'eslint.config.mjs',
  'generate-package-json.js',
  'integration-tests',
  'tsconfig.json',
  'docs/CHANGELOG_TEMPLATE.md',
  'docs/CHANGELOG_TEMPLATE.en.md',
  'docs/RELEASING.md',
  'docs/RELEASING.en.md',
  'scripts/build-release-notes.js',
  'scripts/bundle-extension.js',
  'scripts/clean-output.js',
  'scripts/icon_tools',
  'scripts/localized-manifest.js',
  'scripts/manifest-localizations.js',
  'scripts/run-integration-tests.js',
]
for (const relativePath of obsoletePaths) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} must not reappear`)
}

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
assert.match(gitignore, /^\/package\.nls\*\.json$/m)
assert.doesNotMatch(gitignore, /^\.vscode\/settings\.json$/m)

const settings = JSON.parse(fs.readFileSync(path.join(root, '.vscode', 'settings.json'), 'utf8'))
assert.equal(settings['explorer.fileNesting.enabled'], true)
assert.equal(settings['explorer.fileNesting.expand'], false)
assert.equal(
  settings['explorer.fileNesting.patterns']?.['package.json'],
  'package-lock.json, package.nls*.json, .nvmrc'
)

console.log('Project structure and generated-file boundaries are valid')
