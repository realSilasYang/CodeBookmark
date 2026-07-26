/**
 * 验证跨模块共享的纯基础能力保持原有边界，错误文本不增饰且字节单位保持一致。
 * 可选读取只能忽略不存在，VS Code 文档查询也不能接受非 file 文档。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { describe, it } = require('node:test')
const { withModuleMocks } = require('../../scripts/test-support/module-mocks')

const { formatBinaryByteSize } = require('../../out/util/ByteSize')
const { errorMessage } = require('../../out/util/ErrorMessage')
const {
  fileSystemErrorCode,
  isFileNotFoundError,
  pathExists,
  readFileIfExists,
} = require('../../out/util/FileSystem')
const { KeyedTimerStore } = require('../../out/util/KeyedTimerStore')
const { sha256Hex } = require('../../out/util/Sha256')
const { ReplaceableDisposable } = require('../../out/util/ReplaceableDisposable')

describe('shared infrastructure', () => {
  it('preserves the established error and binary byte-size text', () => {
    assert.equal(errorMessage(new Error('failed')), 'failed')
    assert.equal(errorMessage('failed'), 'failed')
    assert.equal(errorMessage({ code: 'E_TEST' }), '[object Object]')
    assert.equal(formatBinaryByteSize(0), '0 KiB')
    assert.equal(formatBinaryByteSize(1025), '2 KiB')
    assert.equal(formatBinaryByteSize(1024 * 1024), '1.00 MiB')
    assert.equal(sha256Hex('CodeBookmark'), 'bf8c6adfaef64764e807ef6a98e92e9a197479922aac30e01694ecbeec99f79f')
  })

  it('returns undefined only when an optional file is absent', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codebookmark-shared-filesystem-'))
    const filePath = path.join(root, 'state.json')
    try {
      assert.equal(await pathExists(filePath), false)
      assert.equal(await readFileIfExists(filePath), undefined)
      await fs.writeFile(filePath, 'saved', 'utf8')
      assert.equal(await pathExists(filePath), true)
      assert.equal((await readFileIfExists(filePath)).toString('utf8'), 'saved')
      assert.equal(isFileNotFoundError(Object.assign(new Error('missing'), { code: 'ENOENT' })), true)
      assert.equal(isFileNotFoundError(Object.assign(new Error('denied'), { code: 'EACCES' })), false)
      assert.equal(fileSystemErrorCode({ code: 404 }), undefined)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('reads document lines and matches only open local files', async () => {
    const target = path.resolve('src/example.ts')
    const fileDocument = {
      uri: { scheme: 'file', fsPath: target },
      lineCount: 2,
      lineAt: line => ({ text: line === 0 ? 'first' : 'second' }),
    }
    const virtualDocument = {
      uri: { scheme: 'untitled', fsPath: target },
      lineCount: 1,
      lineAt: () => ({ text: 'virtual' }),
    }
    const vscodeMock = {
      workspace: { textDocuments: [virtualDocument, fileDocument] },
      window: { activeTextEditor: { document: fileDocument } },
    }
    await withModuleMocks({ vscode: vscodeMock }, async () => {
      const modulePath = require.resolve('../../out/util/VscodeDocument')
      delete require.cache[modulePath]
      const { activeFileUri, findOpenFileDocument, textDocumentLines } = require(modulePath)
      assert.deepEqual(textDocumentLines(fileDocument), ['first', 'second'])
      assert.equal(findOpenFileDocument(target), fileDocument)
      assert.equal(findOpenFileDocument(path.resolve('src/missing.ts')), undefined)
      assert.equal(activeFileUri(), fileDocument.uri)
      vscodeMock.window.activeTextEditor = { document: virtualDocument }
      assert.equal(activeFileUri(), undefined)
      delete require.cache[modulePath]
    })
  })

  it('does not let a replaced timer callback remove its successor', () => {
    const scheduled = []
    const cleared = []
    const store = new KeyedTimerStore({
      setTimer: callback => {
        const timer = { callback }
        scheduled.push(timer)
        return timer
      },
      clearTimer: timer => cleared.push(timer),
    })
    let calls = 0
    store.replace('file', () => { calls++ }, 10)
    const first = scheduled[0]
    store.replace('file', () => { calls++ }, 10)
    assert.deepEqual(cleared, [first])
    first.callback()
    store.cancelWhere(key => key === 'file')
    assert.equal(calls, 1)
    assert.deepEqual(cleared, [first, scheduled[1]])
  })

  it('releases replaced and final disposable resources exactly once', () => {
    const disposed = []
    const holder = new ReplaceableDisposable()
    holder.replace({ dispose: () => disposed.push('first') })
    holder.replace({ dispose: () => disposed.push('second') })
    holder.dispose()
    holder.dispose()
    assert.deepEqual(disposed, ['first', 'second'])
  })
})
