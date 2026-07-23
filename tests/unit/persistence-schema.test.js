/**
 * 模块说明：本文件负责纯逻辑单元测试，具体对象为 `persistence-schema.test`。
 *
 * 实现要点：用小型夹具覆盖正常输入、非法输入和边界状态，保持测试快速且可重复。
 * 核心边界：测试使用可重复的输入与隔离环境验证公开行为，不依赖人工界面判断。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const {
  PersistenceFormats,
  decodePersistenceList,
  decodePersistenceRecord,
  versionPersistenceList,
} = require('../../out/util/PersistenceSchema')

describe('PersistenceSchema', () => {
  it('adds a stable identity to records and lists', () => {
    assert.deepEqual(decodePersistenceRecord({ bookmarks: [] }, PersistenceFormats.script).value, {
      bookmarks: [],
      format: 'codebookmark.script',
      schemaVersion: 1,
    })
    assert.deepEqual(versionPersistenceList(PersistenceFormats.workspaceOrder, 'order', ['src/a.ts']), {
      order: ['src/a.ts'],
      format: 'codebookmark.workspace-order',
      schemaVersion: 1,
    })
  })

  it('migrates only completely unversioned values', () => {
    const record = decodePersistenceRecord({ bookmarks: [] }, PersistenceFormats.script)
    assert.equal(record.migrated, true)
    assert.equal(record.value.format, PersistenceFormats.script)

    const list = decodePersistenceList(['src/a.ts'], PersistenceFormats.workspaceOrder, 'order')
    assert.equal(list.migrated, true)
    assert.deepEqual(list.value.order, ['src/a.ts'])
  })

  it('accepts the exact current identity without migration', () => {
    const current = {
      format: PersistenceFormats.undoSession,
      schemaVersion: 1,
      scopes: [],
    }
    assert.equal(decodePersistenceRecord(current, PersistenceFormats.undoSession).migrated, false)
  })

  it('rejects partial, foreign, and future version identities', () => {
    for (const value of [
      { format: PersistenceFormats.script, bookmarks: [] },
      { schemaVersion: 1, bookmarks: [] },
      { format: 'other.script', schemaVersion: 1, bookmarks: [] },
      { format: PersistenceFormats.script, schemaVersion: 2, bookmarks: [] },
    ]) {
      assert.throws(() => decodePersistenceRecord(value, PersistenceFormats.script))
    }
  })
})
