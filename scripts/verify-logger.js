/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-logger`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-logger` 对应契约。
 * 核心边界：通过断言锁定“verify-logger”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')

const appended = []
let appendThrows = false
let disposed = false

installModuleMocks({
  vscode: {
    window: {
      createOutputChannel: () => ({
        appendLine(message) {
          if (appendThrows) throw new Error('Channel has been closed')
          appended.push(message)
        },
        dispose() { disposed = true },
      }),
      showWarningMessage: async () => undefined,
      showInformationMessage: async () => undefined,
    },
  },
})

const { logger } = require('../out/util/Logger')
const localization = require('../out/i18n/Localization')

localization.initializeLocalization('en')
logger.info('Ready')
assert.deepEqual(appended, ['[INFO] Ready'])

appendThrows = true
assert.doesNotThrow(() => logger.info('Closing'))
const originalConsoleError = console.error
console.error = () => undefined
try {
  assert.doesNotThrow(() => logger.error('Failure'))
} finally {
  console.error = originalConsoleError
}

logger.dispose()
assert.equal(disposed, true)
appendThrows = false
logger.info('After dispose')
assert.deepEqual(appended, ['[INFO] Ready'])

console.log('Logger lifecycle contract verified.')
