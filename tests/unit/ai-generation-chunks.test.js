/**
 * 验证大源码 AI 生成分段的连续负责区间、全局行号、上下文重叠和多字节边界。
 * 测试同时覆盖上下文父节点提升，确保结构性注释不会因跨段而丢失。
 */
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  filterAIBookmarksToRange,
  splitAIGenerationChunks,
} = require('../../out/util/AIGenerationChunks')

test('small source remains one globally numbered generation chunk', () => {
  const chunks = splitAIGenerationChunks('first\r\n第二行\nthird')
  assert.equal(chunks.length, 1)
  assert.deepEqual(chunks[0], {
    startLine: 0,
    endLine: 3,
    contextStartLine: 0,
    contextEndLine: 3,
    numberedSource: '1 | first\n2 | 第二行\n3 | third',
  })
})

test('large source has contiguous responsible ranges and overlapping context', () => {
  const source = Array.from({ length: 100 }, (_, index) => `// section ${index} ${'x'.repeat(30)}`).join('\n')
  const chunks = splitAIGenerationChunks(source, 500, 4)
  assert.ok(chunks.length > 1)
  assert.equal(chunks[0].startLine, 0)
  assert.equal(chunks.at(-1).endLine, 100)

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]
    assert.ok(chunk.startLine < chunk.endLine)
    assert.ok(chunk.contextStartLine <= chunk.startLine)
    assert.ok(chunk.contextEndLine >= chunk.endLine)
    assert.match(chunk.numberedSource, new RegExp(`^${chunk.contextStartLine + 1} \\| `))
    if (index > 0) {
      assert.equal(chunk.startLine, chunks[index - 1].endLine)
      assert.ok(chunk.contextStartLine < chunk.startLine)
    }
  }
})

test('UTF-8 source size participates in chunking and long lines are intact', () => {
  const longLine = '注释'.repeat(200)
  const source = `${longLine}\n${'数据'.repeat(80)}\nend`
  const chunks = splitAIGenerationChunks(source, 100, 1)
  assert.ok(chunks.length > 1)
  assert.match(chunks[0].numberedSource, new RegExp(`1 \\| ${longLine}`))
  assert.match(chunks.at(-1).numberedSource, /3 \| end/)
})

test('context-only parents are promoted while responsible children remain', () => {
  const child = { label: 'Child section', line: 12, content: '// child', subs: [] }
  const parent = { label: 'Context module', line: 2, content: '// module', subs: [child] }
  const filtered = filterAIBookmarksToRange([parent], bookmark => bookmark.line, 10, 20)
  assert.deepEqual(filtered, [child])
})

test('append retains an existing parent outside the chunk only when it contains responsible children', () => {
  const child = { label: 'New stage', line: 12, content: '// new stage', subs: [] }
  const unrelated = { label: 'Other segment', line: 30, content: '// other segment', subs: [] }
  const parent = { label: 'Existing module', line: 2, content: '// module', subs: [child, unrelated] }
  const filtered = filterAIBookmarksToRange([parent], bookmark => bookmark.line, 10, 20, new Set([2, 30]))
  assert.deepEqual(filtered, [{ ...parent, subs: [child] }])
  assert.deepEqual(filterAIBookmarksToRange([parent], bookmark => bookmark.line, 40, 50, new Set([2])), [])
})
