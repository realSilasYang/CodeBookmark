/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-code-marker-source-reader`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-code-marker-source-reader` 对应契约。
 * 核心边界：通过断言锁定“verify-code-marker-source-reader”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { CodeMarkerSourceReader } = require('../out/providers/CodeMarkerSourceReader')

function createHarness(options = {}) {
  const events = []
  const reader = new CodeMarkerSourceReader(10)
  const documents = options.documents ?? []
  const port = {
    openDocuments: () => documents,
    documentUri: document => document.uri,
    isFileUri: uri => uri.scheme === 'file',
    filePath: uri => uri.fsPath,
    sameFilePath: (left, right) => left.toLowerCase() === right.toLowerCase(),
    documentLines: document => document.lines,
    documentLanguage: document => document.languageId,
    profilesInitialized: () => options.profilesInitialized ?? true,
    supportsFile: filePath => {
      events.push(`supports:${filePath}`)
      return options.supported ?? true
    },
    statFile: async filePath => {
      events.push(`stat:${filePath}`)
      if (options.statError) throw options.statError
      return { isFile: options.isFile ?? true, size: options.size ?? 5 }
    },
    readTextFile: async filePath => {
      events.push(`read:${filePath}`)
      return options.content ?? 'one\r\ntwo\rthree\nfour'
    },
  }
  return { events, port, reader }
}

async function main() {
  const uri = { scheme: 'file', fsPath: 'C:/workspace/main.ts' }
  const open = createHarness({
    supported: false,
    size: 100,
    documents: [{ uri: { scheme: 'file', fsPath: 'c:/WORKSPACE/main.ts' }, lines: ['open'], languageId: 'typescript' }],
  })
  assert.deepEqual(await open.reader.read(uri, false, open.port), { lines: ['open'], languageId: 'typescript' })
  assert.deepEqual(open.events, [])

  const unsupported = createHarness({ supported: false })
  assert.equal(await unsupported.reader.read(uri, false, unsupported.port), undefined)
  assert.deepEqual(unsupported.events, ['supports:C:/workspace/main.ts'])

  const large = createHarness({ size: 11 })
  assert.equal(await large.reader.read(uri, false, large.port), undefined)
  assert.equal(large.events.includes('read:C:/workspace/main.ts'), false)

  const allowedLarge = createHarness({ supported: false, size: 100, content: 'large file' })
  assert.deepEqual(await allowedLarge.reader.read(uri, true, allowedLarge.port), { lines: ['large file'] })
  assert.equal(allowedLarge.events.some(event => event.startsWith('supports:')), false)

  const binary = createHarness({ content: `text\0binary` })
  assert.equal(await binary.reader.read(uri, false, binary.port), undefined)

  const text = createHarness()
  assert.deepEqual(await text.reader.read(uri, false, text.port), { lines: ['one', 'two', 'three', 'four'] })

  const failed = createHarness({ statError: new Error('missing') })
  assert.equal(await failed.reader.read(uri, false, failed.port), undefined)

  console.log('CodeMarkerSourceReader contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
