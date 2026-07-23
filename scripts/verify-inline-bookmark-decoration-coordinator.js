/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-inline-bookmark-decoration-coordinator`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-inline-bookmark-decoration-coordinator` 对应契约。
 * 核心边界：通过断言锁定“verify-inline-bookmark-decoration-coordinator”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createHarness`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
