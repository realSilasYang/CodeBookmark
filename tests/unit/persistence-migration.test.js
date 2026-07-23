const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { it } = require('node:test')

const { persistLegacyJsonMigration } = require('../../out/util/PersistenceMigration')

it('backs up an unversioned JSON file before persisting its v1 replacement', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codebookmark-schema-migration-'))
  const filePath = path.join(root, 'configuration.json')
  const backupPath = `${filePath}.migration-v0.backup`
  const legacy = { bookmarks: ['legacy'] }
  const versioned = {
    format: 'codebookmark.script',
    schemaVersion: 1,
    bookmarks: ['current'],
  }
  try {
    await fs.writeFile(filePath, JSON.stringify(legacy), 'utf8')
    await persistLegacyJsonMigration(filePath, versioned, async (target, value) => {
      await fs.writeFile(target, JSON.stringify(value), 'utf8')
      return true
    })
    assert.deepEqual(JSON.parse(await fs.readFile(backupPath, 'utf8')), legacy)
    assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), versioned)

    await persistLegacyJsonMigration(filePath, { ...versioned, bookmarks: ['newer'] }, async (target, value) => {
      await fs.writeFile(target, JSON.stringify(value), 'utf8')
      return true
    })
    assert.deepEqual(JSON.parse(await fs.readFile(backupPath, 'utf8')), legacy)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
