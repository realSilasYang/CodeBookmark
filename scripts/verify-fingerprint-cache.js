/**
 * 验证书签定位在同一文档版本内复用候选，并覆盖删除、撤销、重排、重复行和跨行选区。
 * 三层书签的原始选区与内容需要在失效期间保留，撤销后恢复同一批节点。
 */
const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')
installModuleMocks({ vscode: {} })
const { StickyBookmarkTracker } = require('../out/util/StickyBookmarkTracker')
const { ContextBookmark } = require('../out/util/ContextValue')

function documentFor(text) {
  let lines = text.split(/\r?\n/)
  const position = offset => {
    const previous = text.slice(0, offset).split(/\r?\n/)
    return { line: previous.length - 1, character: previous.at(-1).length }
  }
  return {
    version: 1,
    get lineCount() { return lines.length },
    getText: () => text,
    lineAt: line => ({ text: lines[line] }),
    change(...edits) {
      const changes = edits.map(([start, end, inserted]) => ({
        range: { start: position(start), end: position(end) },
        rangeOffset: start,
        rangeLength: end - start,
        text: inserted,
      }))
      for (const [start, end, inserted] of edits.sort((a, b) => b[0] - a[0])) {
        text = text.slice(0, start) + inserted + text.slice(end)
      }
      lines = text.split(/\r?\n/)
      this.version++
      return changes
    },
  }
}

function bookmark(document, line, endLine = line, endColumn = 0) {
  const start = { line, column: 0 }
  const end = { line: endLine, column: endColumn }
  const lines = Array.from({ length: endLine - line + 1 }, (_, offset) => document.lineAt(line + offset).text)
  if (endColumn > 0) lines[lines.length - 1] = lines.at(-1).slice(0, endColumn)
  return {
    start, end, content: lines.join(document.getText().includes('\r\n') ? '\r\n' : '\n').trim(),
    contextValue: ContextBookmark.Bookmark,
    get isBookmarkInvalid() { return this.contextValue === ContextBookmark.BookmarkInvalid },
  }
}

const tracker = new StickyBookmarkTracker()
const header = 'const leadingSentinel = true;\r\n'
const block = ['function deletedFeature() {', '  const nestedSource = 123;', '  return value;', '}'].join('\r\n') + '\r\n'
const suffix = [
  'function unrelatedFeature() {',
  '  const unrelatedValue = 4;',
  '  return value;',
  '}',
  'const trailingSentinel = true;',
].join('\r\n')
const document = documentFor(header + block + suffix)
const parent = bookmark(document, 1, 4, 1)
const child = bookmark(document, 2)
const grandchild = bookmark(document, 3)
const survivor = bookmark(document, 9)
const nodes = [parent, child, grandchild, survivor]
parent.subs = [child]
child.subs = [grandchild]
for (const node of nodes) tracker.updateContext(node, document)
assert.equal(parent.contextAfter, 'function unrelatedFeature() {')
const saved = nodes.slice(0, 3).map(node => ({ content: node.content, start: { ...node.start }, end: { ...node.end } }))

assert.equal(tracker.reconcile(nodes, document, document.change([header.length, header.length + block.length, ''])), 4)
assert.ok(nodes.slice(0, 3).every(node => node.isBookmarkInvalid))
assert.deepEqual(nodes.slice(0, 3).map(({ content, start, end }) => ({ content, start, end })), saved)
assert.equal(parent.subs[0], child)
assert.equal(child.subs[0], grandchild)
assert.equal(survivor.start.line, 5)

const reloaded = new StickyBookmarkTracker()
assert.equal(reloaded.reconcile(nodes, document), 0, 'reloading must keep deleted siblings invalid')
assert.ok(nodes.slice(0, 3).every(node => node.isBookmarkInvalid))

const restored = document.change([header.length, header.length, block])
assert.equal(tracker.reconcile(nodes, document, restored), 4)
assert.ok(nodes.every(node => !node.isBookmarkInvalid))
assert.deepEqual(nodes.slice(0, 3).map(({ content, start, end }) => ({ content, start, end })), saved)

const oldLine = document.lineAt(2).text
const start = header.length + document.lineAt(1).text.length + 2
tracker.reconcile(nodes, document, document.change([start, start + oldLine.length, '  const revisedSource = 456;']))
assert.equal(child.content, 'const revisedSource = 456;')
assert.equal(child.start.line, 2)
assert.match(parent.content, /revisedSource/)

const current = tracker.snapshot(document)
const duplicates = current.candidates('return value;', true)
assert.equal(duplicates.length, 2)
assert.equal(current.candidates('return value;', true), duplicates)
assert.equal(current.candidates('return val', false).length, 0, 'partial tokens must not match')
tracker.reconcile(nodes, document, document.change([0, 0, '// inserted\r\n']))
assert.equal(survivor.start.line, 10)
assert.notEqual(tracker.snapshot(document), current)

const offline = documentFor('new first line\nfunction other() {\n  return value;\n}\n')
const shortAnchor = bookmark(offline, 2)
shortAnchor.contextBefore = 'function removed() {'
shortAnchor.contextAfter = '}'
assert.equal(new StickyBookmarkTracker().reconcile([shortAnchor], offline), 1)
assert.equal(shortAnchor.isBookmarkInvalid, true)

const ambiguous = documentFor('old context\nfunction sharedDefinition() {}\nseparator\nold context\nfunction sharedDefinition() {}')
const repeated = bookmark(ambiguous, 1)
repeated.contextBefore = 'old context'
assert.equal(new StickyBookmarkTracker().reconcile([repeated], ambiguous), 1)
assert.equal(repeated.isBookmarkInvalid, true)

const selected = documentFor('const leadingSource = 1\n  const selection = 42;\nconst endingSource = 2')
const range = bookmark(selected, 1, 1, 22)
range.start.column = 2
const crlf = documentFor('\r\n' + selected.getText().replace(/\n/g, '\r\n'))
new StickyBookmarkTracker().reconcile([range], crlf)
assert.deepEqual(range.start, { line: 2, column: 2 })
assert.deepEqual(range.end, { line: 2, column: 22 })
