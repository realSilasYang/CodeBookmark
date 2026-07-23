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
