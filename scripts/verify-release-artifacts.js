/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-release-artifacts`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-release-artifacts` 对应契约。
 * 核心边界：通过断言锁定“verify-release-artifacts”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
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
