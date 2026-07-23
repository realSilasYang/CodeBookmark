/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-file-change-fingerprints`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-file-change-fingerprints` 对应契约。
 * 核心边界：通过断言锁定“verify-file-change-fingerprints”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { fileChangeFingerprints, hashContent } = require('../out/util/FileChangeFingerprint')

async function main() {
	const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-file-change-'))
  const file = path.join(folder, 'bookmarks.json')
  try {
		fs.writeFileSync(file, '{"value":1}', 'utf8')
    await fileChangeFingerprints.rememberDirectory(folder)

		const prepared = await fileChangeFingerprints.prepareWrite(file, '{"value":2}')
    assert.ok(prepared)
    assert.equal(await fileChangeFingerprints.isCurrentHash(file, prepared.expectedDiskHash), true)
    fileChangeFingerprints.markWriteFailed(file, prepared.contentHash)

		const selfContent = '{"value":2}'
    const selfHash = fileChangeFingerprints.markWriteIntent(file, selfContent)
    assert.equal(selfHash, hashContent(selfContent))
    await new Promise(resolve => setTimeout(resolve, 20))
    fs.writeFileSync(file, selfContent, 'utf8')
    fileChangeFingerprints.markWriteComplete(file, selfHash)
    assert.equal(await fileChangeFingerprints.hasExternalChange(folder, 'bookmarks.json'), false)
    assert.equal(await fileChangeFingerprints.hasExternalChange(folder, 'bookmarks.json'), false)

		fs.writeFileSync(file, '{"value":3,"external":true}', 'utf8')
    assert.equal(await fileChangeFingerprints.prepareWrite(file, '{"local":true}'), undefined)
    assert.equal(await fileChangeFingerprints.hasExternalChange(folder, 'bookmarks.json'), true)

    fs.writeFileSync(path.join(folder, 'external.json'), '{"new":true}', 'utf8')
    assert.equal(await fileChangeFingerprints.hasExternalChange(folder, null), true)

    fileChangeFingerprints.markDeleteIntent(file)
    fs.unlinkSync(file)
    fileChangeFingerprints.markDeleteComplete(file)
    assert.equal(await fileChangeFingerprints.hasExternalChange(folder, 'bookmarks.json'), false)
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
