/**
 * 模块说明：本文件负责发布产物与供应链信息生成，具体对象为 `write-sha256sums`。
 *
 * 实现要点：根据当前版本和构建产物生成可校验的发布说明、摘要或物料清单。
 * 核心边界：生成结果必须确定、可复现，并与源码清单及发布校验保持一致。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const [outputFile, ...inputFiles] = process.argv.slice(2)
if (!outputFile || inputFiles.length === 0) {
  console.error('Usage: node scripts/release/write-sha256sums.js <output-file> <artifact> [...]')
  process.exit(1)
}

const names = new Set()
const lines = inputFiles.map(file => {
  const name = path.basename(file)
  if (names.has(name)) throw new Error(`Duplicate artifact name: ${name}`)
  names.add(name)
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  return `${digest}  ${name}`
})
fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true })
fs.writeFileSync(outputFile, `${lines.join('\n')}\n`, 'utf8')
