const assert = require('node:assert/strict')
const { installModuleMocks } = require('./test-support/module-mocks')

const vscodeMock = {
  TreeItem: class {},
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: { workspaceFolders: [], textDocuments: [], getWorkspaceFolder: () => undefined },
  window: { activeTextEditor: undefined, createOutputChannel: () => ({ appendLine() {}, dispose() {} }) },
}
installModuleMocks({ vscode: vscodeMock })

const matcher = require('../out/util/FingerprintMatcher')
const { fileUtils } = require('../out/util/FileUtils')

function makeDocument(lines, version) {
  const eol = '\r\n'
  const fullText = lines.join(eol)
  const starts = []
  let offset = 0
  for (const line of lines) {
    starts.push(offset)
    offset += line.length + eol.length
  }
  return {
    version,
    lineCount: lines.length,
    uri: { fsPath: 'C:\\synthetic.ts' },
    lineAt: line => ({ text: lines[line] }),
    getText: () => fullText,
    positionAt: index => {
      let line = 0
      while (line + 1 < starts.length && starts[line + 1] <= index) line++
      return { line, character: index - starts[line] }
    },
  }
}

function baselineBest(snapshot, doc, content, originalLine, expected) {
  let bestIndex = -1
  let bestScore = Number.NEGATIVE_INFINITY
  let currentIndex = snapshot.fullText.indexOf(content)
  while (currentIndex !== -1) {
    const position = doc.positionAt(currentIndex)
    const score = matcher.scoreFingerprintCandidate(
      originalLine,
      position.line,
      expected,
      matcher.getFingerprintContext(snapshot.lines, position.line, content),
    )
    if (score > bestScore) {
      bestScore = score
      bestIndex = currentIndex
    }
    currentIndex = snapshot.fullText.indexOf(content, currentIndex + 1)
  }
  return bestIndex
}

function cachedBest(doc, snapshot, content, originalLine, expected) {
  let bestIndex = -1
  let bestScore = Number.NEGATIVE_INFINITY
  const preparedExpected = matcher.prepareFingerprintContext(expected)
  for (const candidate of fileUtils.getFingerprintCandidates(doc, snapshot, content)) {
    const score = matcher.scorePreparedFingerprintCandidate(
      originalLine,
      candidate.line,
      preparedExpected,
      candidate.context,
    )
    if (score > bestScore) {
      bestScore = score
      bestIndex = candidate.index
    }
  }
  return bestIndex
}

let seed = 0x12345678
function randomText() {
  seed = (seed * 1664525 + 1013904223) >>> 0
  const values = [undefined, '', 'alpha beta', ' alpha   beta ', 'return value', 'a-b_c', '\u4e2d\u6587']
  return values[Math.floor((seed / 0x100000000) * values.length)]
}

for (let index = 0; index < 10000; index++) {
  const expected = { before: randomText(), after: randomText() }
  const actual = { before: randomText(), after: randomText() }
  const originalLine = index % 1000
  const candidateLine = (index * 37) % 1000
  assert.equal(
    matcher.scorePreparedFingerprintCandidate(
      originalLine,
      candidateLine,
      matcher.prepareFingerprintContext(expected),
      matcher.prepareFingerprintContext(actual),
    ),
    matcher.scoreFingerprintCandidate(originalLine, candidateLine, expected, actual),
  )
}

const lines = []
for (let index = 0; index < 4000; index++) {
  if (index % 13 === 0) lines.push('const repeated = true;')
  else if (index % 17 === 0) lines.push('return value;')
  else if (index % 29 === 0) lines.push('const multiline = {')
  else if (index % 29 === 1) lines.push('  value: true')
  else lines.push(`line-${index}`)
}

const doc = makeDocument(lines, 1)
const snapshot = fileUtils.getDocumentSnapshot(doc)
const repeated = 'const repeated = true;'
const multiline = 'const multiline = {\r\n  value: true'
const repeatedCandidates = fileUtils.getFingerprintCandidates(doc, snapshot, repeated)
assert.equal(fileUtils.getFingerprintCandidates(doc, snapshot, repeated), repeatedCandidates)
assert.ok(repeatedCandidates.length > 100)

for (const content of [repeated, 'return value;', multiline, 'line-100']) {
  for (let originalLine = 0; originalLine < lines.length; originalLine += 113) {
    const expected = matcher.getFingerprintContext(lines, originalLine, content)
    assert.equal(cachedBest(doc, snapshot, content, originalLine, expected), baselineBest(snapshot, doc, content, originalLine, expected))
  }
}

const lineMatchLines = ['section one', '', '  ', 'value', 'section two', '', 'value']
const lineMatchDoc = makeDocument(lineMatchLines, 1)
const lineMatchSnapshot = fileUtils.getDocumentSnapshot(lineMatchDoc)
for (const content of ['', 'value', 'section']) {
  for (let originalLine = 0; originalLine < lineMatchLines.length; originalLine++) {
    const expected = matcher.getFingerprintContext(lineMatchLines, originalLine, content)
    assert.equal(
      fileUtils.findBestFingerprintLine(lineMatchDoc, lineMatchSnapshot, content, originalLine, expected),
      matcher.findBestFingerprintLine(lineMatchLines, content, originalLine, expected),
    )
  }
}

const aborted = new AbortController()
aborted.abort()
assert.deepEqual(fileUtils.getFingerprintCandidates(doc, snapshot, 'line-3999', aborted.signal), [])
assert.equal(fileUtils.getFingerprintCandidates(doc, snapshot, 'line-3999').length, 1)

const changedLines = lines.slice()
changedLines[0] = 'changed first line'
doc.version = 2
doc.lineAt = line => ({ text: changedLines[line] })
doc.getText = () => changedLines.join('\r\n')
const changedSnapshot = fileUtils.getDocumentSnapshot(doc)
assert.notEqual(changedSnapshot, snapshot)
assert.notEqual(fileUtils.getFingerprintCandidates(doc, changedSnapshot, repeated), repeatedCandidates)

console.log('PASS: prepared scoring, duplicate/multiline candidates, abort handling, and version invalidation')
