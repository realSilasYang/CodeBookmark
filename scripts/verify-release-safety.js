const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const excludedDirectories = new Set(['.git', '.vscode-test', 'node_modules', 'out'])
const excludedFiles = new Set([path.resolve(__filename)])
const textExtensions = new Set(['.js', '.json', '.md', '.mjs', '.ts', '.txt', '.yaml', '.yml'])
const forbiddenArtifacts = [/\.vsix$/i, /\.tgz$/i, /\.log$/i]
const forbiddenText = [
  ['GitHub token', new RegExp('gh' + '[pousr]_[A-Za-z0-9]{30,}')],
  ['GitHub fine-grained token', new RegExp('github_' + 'pat_[A-Za-z0-9_]{30,}')],
  ['OpenAI-style secret key', new RegExp('s' + 'k-[A-Za-z0-9_-]{20,}')],
  ['AWS access key', new RegExp('AK' + 'IA[0-9A-Z]{16}')],
  ['private key', new RegExp('-----BEGIN (?:RSA |EC |OPENSSH )?' + 'PRIVATE KEY-----')],
  ['Windows user profile path', /[A-Za-z]:\\Users\\[^\s'"`]+/i],
  ['macOS user profile path', /\/Users\/[^\s/'"`]+/],
  ['Linux user profile path', /\/home\/[^\s/'"`]+/],
]

function visit(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue
    const entryPath = path.join(folder, entry.name)
    const relativePath = path.relative(root, entryPath)
    if (entry.isDirectory()) {
      visit(entryPath)
      continue
    }
    if (!entry.isFile()) continue
    assert.equal(
      forbiddenArtifacts.some(pattern => pattern.test(entry.name)),
      false,
      `Release artifact must not remain in the repository: ${relativePath}`,
    )
    if (entry.name === '.env' || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) {
      assert.fail(`Local environment file must not remain in the repository: ${relativePath}`)
    }
    if (excludedFiles.has(path.resolve(entryPath)) || !textExtensions.has(path.extname(entry.name).toLowerCase())) continue
    const content = fs.readFileSync(entryPath, 'utf8')
    for (const [description, pattern] of forbiddenText) {
      assert.doesNotMatch(content, pattern, `${description} detected in ${relativePath}`)
    }
  }
}

visit(root)
console.log('Release safety scan verified.')
