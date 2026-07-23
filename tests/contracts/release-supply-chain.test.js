/**
 * 模块说明：本文件负责对外契约测试，具体对象为 `release-supply-chain.test`。
 *
 * 实现要点：从生成清单与工作流文件读取实际配置，验证扩展边界和发布供应链约束。
 * 核心边界：测试使用可重复的输入与隔离环境验证公开行为，不依赖人工界面判断。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
    assert.equal(manifest.scripts['package:vsix'], 'vsce package --no-dependencies')
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
    assert.match(workflow, /git merge-base --is-ancestor \$tagCommit origin\/main/)
    assert.match(workflow, /actions\/attest-build-provenance@[0-9a-f]{40}/)
    assert.match(workflow, /actions\/attest-sbom@[0-9a-f]{40}/)
    assert.match(workflow, /write-sha256sums\.js SHA256SUMS/)
    assert.match(workflow, /\$vsix \$sbom SHA256SUMS/)
  })
})
