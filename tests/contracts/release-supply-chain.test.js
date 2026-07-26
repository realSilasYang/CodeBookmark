/**
 * 检查发布工具版本、GitHub Actions 固定 SHA、标签来源和证明步骤。
 * 测试直接读取工作流与锁文件，确保正式发布不能绕过 main 历史或引入漂移依赖。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { describe, it } = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const manifest = JSON.parse(read('package.json'))
const lockfile = JSON.parse(read('package-lock.json'))
const workflowPaths = [
  '.github/workflows/ci.yml',
  '.github/workflows/marketplace-identity.yml',
  '.github/workflows/release.yml',
]

describe('release supply chain', () => {
  it('uses the exact locally installed VSIX publisher', () => {
    assert.equal(manifest.devDependencies['@vscode/vsce'], '3.9.2')
    assert.equal(lockfile.packages['node_modules/@vscode/vsce'].version, '3.9.2')
    assert.equal(manifest.scripts['package:list'], 'vsce ls --no-dependencies')
    assert.equal(manifest.scripts['package:vsix'], 'node scripts/release/package-vsix.js')
  })

  it('pins every third-party action to a full commit SHA', () => {
    for (const workflowPath of workflowPaths) {
      const actions = [...read(workflowPath).matchAll(/^\s*-?\s*uses:\s+([^\s#]+)/gm)]
        .map(match => match[1])
      assert.ok(actions.length > 0)
      for (const action of actions) assert.match(action, /^[^@\s]+@[0-9a-f]{40}$/)
    }
  })

  it('requires main-history provenance and publishes verifiable artifacts', () => {
    const workflow = read('.github/workflows/release.yml')
    const ci = read('.github/workflows/ci.yml')
    assert.match(ci, /runner\.temp.*codebookmark-ci\.vsix/)
    assert.match(workflow, /git merge-base --is-ancestor \$tagCommit origin\/main/)
    assert.match(workflow, /actions\/attest-build-provenance@[0-9a-f]{40}/)
    assert.match(workflow, /actions\/attest-sbom@[0-9a-f]{40}/)
    assert.match(workflow, /write-sha256sums\.js \$sums \$vsix \$sbom/)
    assert.match(workflow, /\$vsix \$sbom \$sums/)
    assert.match(workflow, /Join-Path \$env:RUNNER_TEMP "codebookmark-release"/)
    assert.doesNotMatch(workflow, /\$vsix = "codebookmark-\$version\.vsix"/)
  })
})
