/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-all`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-all` 对应契约。
 * 核心边界：通过断言锁定“verify-all”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
