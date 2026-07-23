const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-release-artifacts-'))
const first = path.join(sandbox, 'first.bin')
const second = path.join(sandbox, 'second.bin')
const sumsPath = path.join(sandbox, 'SHA256SUMS')
const sbomPath = path.join(sandbox, 'codebookmark.sbom.cdx.json')

try {
  fs.writeFileSync(first, 'first artifact\n')
  fs.writeFileSync(second, 'second artifact\n')
  execFileSync(process.execPath, [
    path.join(root, 'scripts', 'release', 'write-sha256sums.js'),
    sumsPath,
    first,
    second,
  ], { cwd: root, stdio: 'pipe' })
  const expected = [first, second].map(file => {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    return `${digest}  ${path.basename(file)}`
  }).join('\n') + '\n'
  assert.equal(fs.readFileSync(sumsPath, 'utf8'), expected)

  const duplicate = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'release', 'write-sha256sums.js'),
    sumsPath,
    first,
    path.join(sandbox, 'nested', path.basename(first)),
  ], { cwd: root, encoding: 'utf8' })
  assert.notEqual(duplicate.status, 0)
  assert.match(duplicate.stderr, /Duplicate artifact name/)

  execFileSync(process.execPath, [
    path.join(root, 'scripts', 'release', 'write-sbom.js'),
    sbomPath,
  ], { cwd: root, stdio: 'pipe' })
  const sbom = JSON.parse(fs.readFileSync(sbomPath, 'utf8'))
  assert.equal(sbom.bomFormat, 'CycloneDX')
  assert.equal(sbom.metadata.component.name, 'CodeBookmark')
  assert.equal(sbom.components.some(component => component.name === '@vscode/vsce'), false)
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true })
}

console.log('Release artifact metadata contract verified.')
