/**
 * 按稳定顺序执行专项验证，并把任一失败原样返回给 npm。
 * 日常验证不会要求尚未发布的开发版本预先写入更新日志；发布模式只执行依赖正式版本资料的守卫。
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const scriptsDir = __dirname
const releaseOnlyScripts = new Set([
  'verify-release-notes.js',
  'verify-release-readiness.js',
])
const requestedModes = process.argv.slice(2)
if (requestedModes.length > 1 || (requestedModes[0] && requestedModes[0] !== '--release-only')) {
  console.error(`未知验证模式：${requestedModes.join(' ')}`)
  process.exit(2)
}
const availableScripts = fs.readdirSync(scriptsDir)
  .filter(file => file.startsWith('verify-') && file.endsWith('.js') && file !== 'verify-all.js')
for (const script of releaseOnlyScripts) {
  if (!availableScripts.includes(script)) {
    console.error(`发布专用验证脚本不存在：${script}`)
    process.exit(2)
  }
}
const requestedMode = requestedModes[0]
const releaseOnly = requestedMode === '--release-only'
const scripts = availableScripts
  .filter(file => releaseOnly === releaseOnlyScripts.has(file))
  .sort()

for (const script of scripts) {
  console.log(`RUN ${script}`)
  const result = spawnSync(process.execPath, [path.join(scriptsDir, script)], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
