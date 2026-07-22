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
