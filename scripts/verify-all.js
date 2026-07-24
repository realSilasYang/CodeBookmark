/**
 * 检查专项验证发现器能够按稳定顺序执行所有 verify-* 脚本，并把任一失败原样返回给 npm。
 * 脚本围绕“检查专项验证发现器能够按稳定顺序执行所有 verify-* 脚本”构造最小输入，同时覆盖正常路径和明确拒绝的边界。
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const scriptsDir = __dirname
const scripts = fs.readdirSync(scriptsDir)
  .filter(file => file.startsWith('verify-') && file.endsWith('.js') && file !== 'verify-all.js')
  .sort()

for (const script of scripts) {
  console.log(`RUN ${script}`)
  const result = spawnSync(process.execPath, [path.join(scriptsDir, script)], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
