/**
 * 覆盖打开文档优先、字节预筛、大文件流式读取、编码边界与不可读文件分类。
 * 脚本直接调用编译后的 `CodeMarkerSourceReader`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { CodeMarkerSourceReader } = require('../out/providers/CodeMarkerSourceReader')
const { scanCodeMarkers } = require('../out/util/CodeMarkerScanner')

function createHarness(options = {}) {
  const events = []
  const reader = new CodeMarkerSourceReader(options.threshold ?? 1024)
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
    openFile: async filePath => {
      events.push(`open:${filePath}`)
      return {
		stat: async () => {
		  events.push(`stat:${filePath}`)
		  if (options.statError) throw options.statError
		  return { isFile: options.isFile ?? true, size: options.size ?? 5 }
		},
		readBytes: async () => {
		  events.push(`read:${filePath}`)
		  if (options.readError) throw options.readError
		  return options.bytes ?? Buffer.from(options.content ?? '// TODO: one\r\ntwo\rthree\nfour', 'utf8')
		},
        readChunks: () => (async function* () {
          events.push(`stream:${filePath}`)
          if (options.readError) throw options.readError
          const bytes = options.bytes ?? Buffer.from(options.content ?? '// TODO: one\r\ntwo\rthree\nfour', 'utf8')
          const chunkSizes = options.chunkSizes ?? [bytes.length]
          let offset = 0
          for (const size of chunkSizes) {
            yield bytes.subarray(offset, Math.min(bytes.length, offset + size))
            offset += size
          }
          if (offset < bytes.length) yield bytes.subarray(offset)
        })(),
        close: async () => { events.push(`close:${filePath}`) },
      }
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
  const openSource = await open.reader.read(uri, false, open.port)
  assert.deepEqual(openSource?.lines, ['open'])
  assert.equal(openSource?.languageId, 'typescript')
  assert.equal(openSource?.readMetrics?.origin, 'document')
  assert.deepEqual(open.events, [])

  const unsupported = createHarness({ supported: false })
  assert.equal(await unsupported.reader.read(uri, false, unsupported.port), undefined)
  assert.deepEqual(unsupported.events, ['supports:C:/workspace/main.ts'])

  const large = createHarness({ threshold: 10, size: 100 })
  assert.deepEqual((await large.reader.read(uri, false, large.port))?.lines, ['// TODO: one', 'two', 'three', 'four'])
  assert.equal(large.events.filter(event => event === 'stream:C:/workspace/main.ts').length, 2)

  const allowedLarge = createHarness({ supported: false, threshold: 10, size: 100, content: 'large file without keywords' })
  const largeSource = await allowedLarge.reader.read(uri, true, allowedLarge.port)
  assert.deepEqual(largeSource?.lines, [])
  assert.equal(largeSource?.readMetrics?.bytesRead, Buffer.byteLength('large file without keywords'))
  assert.equal(largeSource?.readMetrics?.prefilteredEmpty, true)
  assert.equal(allowedLarge.events.filter(event => event.startsWith('stream:')).length, 1)
  assert.equal(allowedLarge.events.some(event => event.startsWith('supports:')), false)

  const binary = createHarness({ content: `text\0binary` })
  assert.equal(await binary.reader.read(uri, false, binary.port), undefined)

  const text = createHarness()
  const textSource = await text.reader.read(uri, false, text.port)
  assert.deepEqual(textSource?.lines, ['// TODO: one', 'two', 'three', 'four'])
  assert.equal(textSource?.readMetrics?.origin, 'file')
  assert.equal(textSource?.readMetrics?.bytesRead, Buffer.byteLength('// TODO: one\r\ntwo\rthree\nfour'))
  assert.equal(textSource?.readMetrics?.prefilteredEmpty, false)

  const lowerCase = createHarness({ content: '// fixme: lower case' })
  assert.deepEqual((await lowerCase.reader.read(uri, false, lowerCase.port))?.lines, ['// fixme: lower case'])

  const utf16 = createHarness({ bytes: Buffer.from(`\ufeff// BUG: utf16`, 'utf16le') })
  assert.deepEqual((await utf16.reader.read(uri, false, utf16.port))?.lines, ['// BUG: utf16'])

  const utf8Bom = createHarness({ bytes: Buffer.from(`\ufeff# TODO: utf8 bom`, 'utf8') })
  assert.deepEqual((await utf8Bom.reader.read(uri, false, utf8Bom.port))?.lines, ['# TODO: utf8 bom'])

  const utf16BigEndianBytes = Buffer.from(`\ufeff// FIXME: utf16be`, 'utf16le')
  utf16BigEndianBytes.swap16()
  const utf16BigEndian = createHarness({ bytes: utf16BigEndianBytes })
  assert.deepEqual((await utf16BigEndian.reader.read(uri, false, utf16BigEndian.port))?.lines, ['// FIXME: utf16be'])

  for (const keyword of ['todo', 'ToDo', 'FIXME', 'FixMe', 'bug', 'BuG']) {
    const casing = createHarness({ content: `// ${keyword}: casing` })
    assert.equal((await casing.reader.read(uri, false, casing.port))?.readMetrics?.prefilteredEmpty, false)
  }

  const streamedAcrossBoundaries = createHarness({
    threshold: 10,
	size: 100,
    content: 'first\r\n// FIXME: streamed\rthird',
    chunkSizes: [3, 7, 5, 1, 2, 4],
  })
  const streamedSource = await streamedAcrossBoundaries.reader.read(uri, false, streamedAcrossBoundaries.port)
  assert.deepEqual(streamedSource?.lines, ['first', '// FIXME: streamed', 'third'])
  assert.equal(streamedSource?.readMetrics?.prefilteredEmpty, false)

  const streamedUtf16 = createHarness({
    threshold: 10,
	size: 100,
    bytes: Buffer.from(`\ufeff// TODO: utf16 streamed`, 'utf16le'),
    chunkSizes: [1, 2, 3, 1, 5],
  })
  assert.deepEqual((await streamedUtf16.reader.read(uri, false, streamedUtf16.port))?.lines, ['// TODO: utf16 streamed'])

  const failed = createHarness({ statError: new Error('missing') })
  assert.equal(await failed.reader.read(uri, false, failed.port), undefined)

  const cLikeProfile = { lineComments: [{ value: '//' }], blockComments: [['/*', '*/']] }
  for (const content of [
    'const value = "TODO: string only"',
    '// Automatic TODO/FIXME/BUG bookmarks require explicit directives.',
    '// TODO: valid line directive',
    '/* FIXME: valid block directive */',
    'const bugIcon = "status_bug.svg"',
    'export const complete = true',
  ]) {
    const exact = scanCodeMarkers(content.split(/\r\n|\n|\r/), 'typescript', uri.fsPath, 100, cLikeProfile)
    const equivalence = createHarness({ content })
    const filteredSource = await equivalence.reader.read(uri, false, equivalence.port)
    const filtered = scanCodeMarkers(filteredSource?.lines ?? [], 'typescript', uri.fsPath, 100, cLikeProfile)
    assert.deepEqual(filtered, exact, `Prefilter changed the exact scan result for: ${content}`)
  }

  console.log('CodeMarkerSourceReader contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
