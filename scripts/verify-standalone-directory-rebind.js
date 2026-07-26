/**
 * 模拟单文件模式的父目录整体移动，验证脚本身份与配置自动跟随。
 * 为核对单文件模式的父目录整体移动，验证脚本身份与配置自动跟随，脚本在临时目录中调用编译后的 `BookmarkRepository` 完成真实操作，检查落盘结果而不是内存假象。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const { scriptEnvelope } = require('./test-support/bookmark-fixtures')
const { createRepositoryVscodeMock } = require('./test-support/repository-vscode-mock')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-standalone-directory-'))
const storageRoot = path.join(sandbox, 'storage')
const scriptFolder = path.join(storageRoot, 'scripts')
const oldDirectory = path.join(sandbox, 'before')
const newDirectory = path.join(sandbox, 'after')
fs.mkdirSync(scriptFolder, { recursive: true })
fs.mkdirSync(oldDirectory, { recursive: true })

const vscodeMock = createRepositoryVscodeMock({ storageRoot, workspaceFolders: undefined })
installModuleMocks({ vscode: vscodeMock })

const { bookmarkRepository } = require('../out/repository/BookmarkRepository')

function envelope(id, scriptPath, content) {
	return scriptEnvelope({ scriptId: id, sourcePath: scriptPath, content })
}

async function main() {
  try {
    const ids = [
      '10000000-0000-9000-1000-000000000081',
      '10000000-0000-9000-1000-000000000082',
    ]
    for (let index = 0; index < ids.length; index++) {
      const sourcePath = path.join(oldDirectory, `${index}.ts`)
      const content = `const standaloneMove${index} = true\n`
      fs.writeFileSync(sourcePath, content)
      fs.writeFileSync(path.join(scriptFolder, `${ids[index]}.json`), JSON.stringify(envelope(ids[index], sourcePath, content)))
    }
    fs.renameSync(oldDirectory, newDirectory)
    const loaded = await bookmarkRepository.readBookmarksFromFile([path.join(newDirectory, '0.ts')])
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].scriptId, ids[0])
    for (let index = 0; index < ids.length; index++) {
      const expected = path.join(newDirectory, `${index}.ts`)
      const data = JSON.parse(fs.readFileSync(path.join(scriptFolder, `${ids[index]}.json`), 'utf8'))
      assert.equal(path.resolve(data.script.path), path.resolve(expected))
      assert.equal(path.resolve(data.bookmarks[0].path), path.resolve(expected))
    }
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
