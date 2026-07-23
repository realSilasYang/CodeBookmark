/**
 * 模块说明：本文件负责验证脚本共享测试替身，具体对象为 `module-mocks`。
 *
 * 实现要点：提供最小 VS Code 替身与模块注入工具，使专项验证不依赖真实宿主。
 * 核心边界：脚本失败时应以非零状态退出，且不得静默改写不属于本任务的用户文件。
 * 主要入口：`installModuleMocks`、`withModuleMocks`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const Module = require('node:module')

function installModuleMocks(mocks) {
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request]
    return originalLoad.call(this, request, parent, isMain)
  }

  let restored = false
  return () => {
    if (restored) return
    restored = true
    Module._load = originalLoad
  }
}

async function withModuleMocks(mocks, operation) {
  const restore = installModuleMocks(mocks)
  try {
    return await operation()
  } finally {
    restore()
  }
}

module.exports = { installModuleMocks, withModuleMocks }
