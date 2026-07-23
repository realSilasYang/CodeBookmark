/**
 * 模块说明：本文件负责发布产物与供应链信息生成，具体对象为 `write-sbom`。
 *
 * 实现要点：根据当前版本和构建产物生成可校验的发布说明、摘要或物料清单。
 * 核心边界：生成结果必须确定、可复现，并与源码清单及发布校验保持一致。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const outputFile = process.argv[2]
if (!outputFile) {
  console.error('Usage: node scripts/release/write-sbom.js <output-file>')
  process.exit(1)
}

const bundledNpmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const npmCli = process.env.npm_execpath || (fs.existsSync(bundledNpmCli) ? bundledNpmCli : undefined)
const command = npmCli ? process.execPath : 'npm'
const content = execFileSync(command, [
  ...(npmCli ? [npmCli] : []),
  'sbom',
  '--omit=dev',
  '--package-lock-only',
  '--sbom-format=cyclonedx',
  '--sbom-type=application',
], {
  cwd: path.resolve(__dirname, '..', '..'),
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})
const sbom = JSON.parse(content)
if (sbom.bomFormat !== 'CycloneDX' || sbom.metadata?.component?.name !== 'CodeBookmark') {
  throw new Error('npm produced an unexpected SBOM document')
}
fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true })
fs.writeFileSync(outputFile, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8')
