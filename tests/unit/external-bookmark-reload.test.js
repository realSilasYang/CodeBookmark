/**
 * 验证外部配置重载在短暂空索引后能够恢复已有书签。
 * 同时确认真正的空视图不会被无意义地重复刷新。
 */
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const { reloadExternalBookmarks } = require('../../out/providers/ExternalBookmarkReloadRunner')

describe('external bookmark reload', () => {
  it('retries an empty reload when the previous view contained bookmarks', async () => {
    let count = 2
    let refreshes = 0
    const port = {
      currentStorageScope: () => 'workspace:c:/workspace',
      currentBookmarkCount: () => count,
      invalidateRepositoryIndex: () => {},
      refresh: async () => {
        refreshes++
        if (refreshes === 1) count = 0
        else count = 1
      },
    }

    await reloadExternalBookmarks(['bookmark.json'], port)

    assert.equal(refreshes, 2)
    assert.equal(count, 1)
  })

  it('does not retry an intentionally empty view', async () => {
    let refreshes = 0
    const port = {
      currentStorageScope: () => 'workspace:c:/workspace',
      currentBookmarkCount: () => 0,
      invalidateRepositoryIndex: () => {},
      refresh: async () => { refreshes++ },
    }

    await reloadExternalBookmarks(['bookmark.json'], port)

    assert.equal(refreshes, 1)
  })
})
