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
