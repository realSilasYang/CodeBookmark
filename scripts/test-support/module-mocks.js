/**
 * 在 Node 模块加载边界临时注入替身，让专项验证能够隔离 VS Code 与文件系统依赖。
 * 执行结束后恢复原始加载器，即使断言抛错也不会把替身泄漏给后续测试。
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
