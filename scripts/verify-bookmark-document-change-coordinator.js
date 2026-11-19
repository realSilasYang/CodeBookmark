/**
 * 验证手动书签逐次收到编辑范围，自动标记只读取防抖后的文档，并取消过期扫描。
 * 通过手动触发旧定时器复现取消与执行相撞的情况。
 */
const assert = require('node:assert/strict')
const { BookmarkDocumentChangeCoordinator } = require('../out/providers/BookmarkDocumentChangeCoordinator')
const { ManualScheduler } = require('./test-support/manual-scheduler')

const events = []
const scheduling = new ManualScheduler()
const coordinator = new BookmarkDocumentChangeCoordinator(scheduling)
const document = { uri: { scheme: 'file', fsPath: 'C:/workspace/src/a.ts' }, lines: ['first'] }
const deletion = { rangeOffset: 0, rangeLength: 9, text: '' }
const insertion = { rangeOffset: 0, rangeLength: 0, text: 'second' }
let generation = 1
let currentScope = true
const port = {
  isFileDocument: current => current.uri.scheme === 'file',
  documentUri: current => current.uri,
  isCurrentScope: () => currentScope,
  filePath: uri => uri.fsPath,
  relativeBookmarkPath: absolutePath => absolutePath.replace('C:/workspace/', ''),
  currentViewGeneration: () => generation,
  relocateBookmarks: (current, changes) => events.push([current.lines[0], changes]),
  documentLines: current => current.lines,
  documentLanguage: () => 'typescript',
  synchronizeCodeMarkers: (uri, lines, language) => {
    events.push([uri.fsPath, lines[0], language])
    return { changed: true }
  },
  persistCodeMarkerChanges: paths => events.push(paths),
  reportFailure: error => { throw error },
}

coordinator.handleChange(document, [], port)
coordinator.handleChange({ uri: { scheme: 'untitled' } }, [deletion], port)
currentScope = false
coordinator.handleChange(document, [deletion], port)
assert.equal(events.length, 0)

currentScope = true
coordinator.handleChange(document, [deletion], port)
document.lines = ['second']
coordinator.handleChange(document, [insertion], port)
assert.deepEqual(events, [['first', [deletion]], ['second', [insertion]]])
assert.equal(scheduling.timers.length, 1)
scheduling.clearedTimers[0].callback()
assert.equal(events.length, 2)
scheduling.runNext()
assert.deepEqual(events.slice(-2), [
  ['C:/workspace/src/a.ts', 'second', 'typescript'],
  ['C:/workspace/src/a.ts'],
])

coordinator.handleChange(document, [insertion], port)
generation++
scheduling.runNext()
assert.equal(events.length, 5, 'stale view must not scan or save')

coordinator.handleChange(document, [insertion], port)
coordinator.cancelBookmarkPath('src')
assert.equal(scheduling.timers.length, 0)
coordinator.handleChange(document, [insertion], port)
coordinator.dispose()
assert.equal(scheduling.timers.length, 0)
