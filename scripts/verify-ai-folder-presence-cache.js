/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-ai-folder-presence-cache`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-ai-folder-presence-cache` 对应契约。
 * 核心边界：通过断言锁定“verify-ai-folder-presence-cache”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`node`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  AIFolderPresenceCache,
  bookmarkPathPresenceSignature,
} = require('../out/providers/AIFolderPresenceCache')

function node(pathValue, isFile = false, subs = []) {
  return {
    path: pathValue,
    isFile,
    subs: { size: subs.length, values: subs },
  }
}

async function main() {
  assert.equal(bookmarkPathPresenceSignature([
    node('src/b.ts', true, [node('src/b.ts'), node('src/a.ts')]),
    node('src/a.ts'),
    node('', false),
  ]), 'src/a.ts\0src/b.ts')

  let now = 1_000
  let scans = 0
  const cache = new AIFolderPresenceCache(5_000, () => now)
  const folder = path.resolve('workspace')
  const mixedPresence = { hasBookmarkedScript: true, hasUnbookmarkedScript: true }
  const scanMixed = async () => {
    scans++
    return mixedPresence
  }

  assert.deepEqual(await cache.getPresence(folder, 'a', scanMixed), mixedPresence)
  assert.deepEqual(await cache.getPresence(path.join(folder, '.'), 'a', scanMixed), mixedPresence)
  assert.equal(scans, 1)

  assert.deepEqual(await cache.getPresence(folder, 'b', async () => {
    scans++
    return { hasBookmarkedScript: true, hasUnbookmarkedScript: false }
  }), { hasBookmarkedScript: true, hasUnbookmarkedScript: false })
  assert.equal(scans, 2)

  now += 5_001
  await cache.getPresence(folder, 'b', scanMixed)
  assert.equal(scans, 3)

  cache.invalidateSourceFiles()
  await cache.getPresence(folder, 'b', scanMixed)
  assert.equal(scans, 4)

  let releaseScan
  const delayed = new Promise(resolve => { releaseScan = resolve })
  const staleResult = cache.getPresence(folder, 'c', async () => {
    scans++
    await delayed
    return { hasBookmarkedScript: false, hasUnbookmarkedScript: false }
  })
  cache.invalidateSourceFiles()
  releaseScan()
  assert.deepEqual(await staleResult, { hasBookmarkedScript: false, hasUnbookmarkedScript: false })
  await cache.getPresence(folder, 'c', scanMixed)
  assert.equal(scans, 6)
}

main().then(
  () => console.log('AIFolderPresenceCache contract verified.'),
  error => {
    console.error(error)
    process.exitCode = 1
  },
)
