/**
 * 覆盖输出通道延迟创建、正常写入、停用释放和通道提前关闭后的静默处理。
 * 脚本直接调用编译后的 `Logger`、`Localization`，只在 VS Code 或文件系统边界使用最小替身。
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
