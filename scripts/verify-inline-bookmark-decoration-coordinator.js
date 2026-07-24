/**
 * 验证当前行书签标签装饰的缓存、文档版本更新、多编辑器隔离和资源复用。
 * 脚本直接调用编译后的 `InlineBookmarkDecorationCoordinator`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const {
  InlineBookmarkDecorationCoordinator,
} = require('../out/providers/InlineBookmarkDecorationCoordinator')
const fs = require('node:fs')

function createHarness() {
  const coordinator = new InlineBookmarkDecorationCoordinator()
  const events = []
  const state = {
    eligible: true,
    enabled: true,
    candidates: [],
  }
  const editor = {
    key: 'file:///workspace/main.ts',
    version: 1,
    cursorLine: 0,
  }
  const port = {
    isEligible: () => state.eligible,
    labelsEnabled: () => state.enabled,
    documentKey: current => current.key,
    documentVersion: current => current.version,
    cursorLine: current => current.cursorLine,
    candidatesForEditor: () => state.candidates,
    candidateLine: candidate => candidate.line,
    candidateLabel: candidate => candidate.label,
    isInvalidCandidate: candidate => candidate.invalid,
    createDecoration: (_current, line, label) => ({ line, text: `  • ${label}` }),
    setDecorations: (_current, decorations) => events.push([...decorations]),
  }
  return { coordinator, editor, events, port, state }
}

const rendered = createHarness()
rendered.state.candidates = [
  { line: 0, label: '', invalid: false },
  { line: 0, label: 'invalid', invalid: true },
  { line: 1, label: 'other line', invalid: false },
  { line: 0, label: 'first', invalid: false },
  { line: 0, label: 'second', invalid: false },
]
rendered.coordinator.update(rendered.editor, rendered.port)
assert.deepEqual(rendered.events, [[{ line: 0, text: '  • first' }]])

rendered.coordinator.update(rendered.editor, rendered.port)
assert.equal(rendered.events.length, 1)
rendered.editor.version++
rendered.coordinator.update(rendered.editor, rendered.port)
assert.equal(rendered.events.length, 2)
rendered.coordinator.invalidate()
rendered.coordinator.update(rendered.editor, rendered.port)
assert.equal(rendered.events.length, 3)

const empty = createHarness()
empty.coordinator.update(empty.editor, empty.port)
assert.deepEqual(empty.events, [[]])
empty.editor.cursorLine++
empty.coordinator.update(empty.editor, empty.port)
assert.deepEqual(empty.events, [[], []])

const cleared = createHarness()
cleared.state.eligible = false
cleared.coordinator.update(cleared.editor, cleared.port)
cleared.coordinator.update(cleared.editor, cleared.port)
cleared.coordinator.invalidate()
cleared.coordinator.update(cleared.editor, cleared.port)
assert.deepEqual(cleared.events, [[]])
cleared.state.eligible = true
cleared.state.enabled = false
cleared.coordinator.update(cleared.editor, cleared.port)
assert.deepEqual(cleared.events, [[]])
cleared.state.enabled = true
cleared.coordinator.update(cleared.editor, cleared.port)
assert.deepEqual(cleared.events, [[], []])

const perEditor = createHarness()
const secondEditor = { key: perEditor.editor.key, version: 1, cursorLine: 0 }
perEditor.coordinator.update(perEditor.editor, perEditor.port)
perEditor.coordinator.update(secondEditor, perEditor.port)
assert.equal(perEditor.events.length, 2)

const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
assert.match(provider, /private readonly inlineBookmarkDecorationPortAdapter:/)
assert.match(provider, /return this\.inlineBookmarkDecorationPortAdapter/)
assert.match(provider, /inlineBookmarkDecorationCoordinator\.invalidate\(\)/)
assert.match(provider, /inlineBookmarkDecorationCoordinator\.update\(editor, this\.inlineBookmarkDecorationPort\(\)\)/)
assert.doesNotMatch(provider, /inlineDecorationKeys|decorationGeneration/)

console.log('InlineBookmarkDecorationCoordinator contract verified.')
