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
