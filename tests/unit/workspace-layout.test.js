/**
 * 锁定工作区视觉布局的稳定引用、节点顺序和隐藏文件状态。
 * 单元测试还覆盖父子循环防护，确保损坏布局无法进入运行时书签树。
 */
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const {
  decodeWorkspaceLayoutPersistence,
  workspaceLayoutPersistence,
  workspaceNodeReferenceKey,
} = require('../../out/models/WorkspaceLayout')

const scriptA = '10000000-0000-9000-1000-000000000001'
const scriptB = '10000000-0000-9000-1000-000000000002'
const bookmarkA = '20000000-0000-9000-1000-000000000001'

const fileA = { kind: 'script', scriptId: scriptA }
const fileB = { kind: 'script', scriptId: scriptB }
const markA = { kind: 'bookmark', scriptId: scriptA, bookmarkId: bookmarkA }

describe('WorkspaceLayout', () => {
  it('round-trips ordered cross-file relationships without content fields', () => {
    const value = workspaceLayoutPersistence([
      { node: fileA, parent: null },
      { node: fileB, parent: fileA },
      { node: markA, parent: fileB },
    ], [], fileB, 42, [
      { node: fileA, expanded: false },
      { node: fileB, expanded: true },
    ])
    const decoded = decodeWorkspaceLayoutPersistence(value)
    assert.equal(decoded.migrated, false)
    assert.equal(decoded.layout.updatedAt, 42)
    assert.deepEqual(decoded.layout.entries, value.entries)
    assert.deepEqual(decoded.layout.pinnedContainer, fileB)
    assert.deepEqual(decoded.layout.expansionStates, value.expansionStates)
    assert.equal(JSON.stringify(value).includes('label'), false)
  })

  it('uses script ownership as part of bookmark identity', () => {
    assert.notEqual(
      workspaceNodeReferenceKey(markA),
      workspaceNodeReferenceKey({ ...markA, scriptId: scriptB }),
    )
  })

  it('rejects duplicate, missing-parent, self and cyclic references', () => {
    const base = value => ({
      format: 'codebookmark.workspace-layout',
      schemaVersion: 1,
      updatedAt: 1,
      hiddenFiles: [],
      pinnedContainer: null,
      expansionStates: [],
      entries: value,
    })
    assert.throws(() => decodeWorkspaceLayoutPersistence(base([
      { node: fileA, parent: null },
      { node: fileA, parent: null },
    ])))
    assert.throws(() => decodeWorkspaceLayoutPersistence(base([
      { node: fileA, parent: fileB },
    ])))
    assert.throws(() => decodeWorkspaceLayoutPersistence(base([
      { node: fileA, parent: fileA },
    ])))
    assert.throws(() => decodeWorkspaceLayoutPersistence(base([
      { node: fileA, parent: fileB },
      { node: fileB, parent: fileA },
    ])))
  })

  it('rejects duplicated or dangling expansion references', () => {
    const value = workspaceLayoutPersistence([{ node: fileA, parent: null }])
    assert.throws(() => decodeWorkspaceLayoutPersistence({
      ...value,
      expansionStates: [
        { node: fileA, expanded: true },
        { node: fileA, expanded: false },
      ],
    }))
    assert.throws(() => decodeWorkspaceLayoutPersistence({
      ...value,
      expansionStates: [{ node: fileB, expanded: true }],
    }))
  })
})
