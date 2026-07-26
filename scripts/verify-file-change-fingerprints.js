/**
 * 覆盖文档内容哈希缓存的版本命中、变化失效和不同 URI 隔离。
 * 脚本在临时目录中调用编译后的 `FileChangeFingerprint` 完成真实操作，检查落盘结果而不是内存假象。
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

		let deletionRan = false
		await fileChangeFingerprints.trackDeletion(file, async () => {
			deletionRan = true
			fs.unlinkSync(file)
		})
		assert.equal(deletionRan, true)
    assert.equal(await fileChangeFingerprints.hasExternalChange(folder, 'bookmarks.json'), false)

		fs.writeFileSync(file, '{"restored":true}', 'utf8')
		await fileChangeFingerprints.rememberDirectory(folder)
		const failure = new Error('delete failed')
		await assert.rejects(
			fileChangeFingerprints.trackDeletion(file, async () => { throw failure }),
			error => error === failure,
		)
		assert.equal(await fileChangeFingerprints.hasExternalChange(folder, 'bookmarks.json'), false)
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
