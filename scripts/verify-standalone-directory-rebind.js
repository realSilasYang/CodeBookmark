/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-standalone-directory-rebind`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-standalone-directory-rebind` 对应契约。
 * 核心边界：通过断言锁定“verify-standalone-directory-rebind”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`envelope`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const { installModuleMocks } = require('./test-support/module-mocks')
const os = require('node:os')
const path = require('node:path')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-standalone-directory-'))
const storageRoot = path.join(sandbox, 'storage')
const scriptFolder = path.join(storageRoot, 'scripts')
const oldDirectory = path.join(sandbox, 'before')
const newDirectory = path.join(sandbox, 'after')
fs.mkdirSync(scriptFolder, { recursive: true })
fs.mkdirSync(oldDirectory, { recursive: true })

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}
class MarkdownString {
  appendMarkdown() {}
  appendText() {}
  appendCodeblock() {}
}
const vscodeMock = {
  TreeItem,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {}, ThemeColor: class {}, MarkdownString,
  Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
  workspace: {
    workspaceFolders: undefined,
    textDocuments: [],
    getWorkspaceFolder: () => undefined,
    getConfiguration: section => ({
      get: key => {
        if (section === 'codebookmark' && key === 'globalStoragePath') return storageRoot
        if (section === 'codebookmark' && key === 'autoSpace') return true
        return undefined
      },
    }),
  },
  window: {
    activeTextEditor: undefined,
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showQuickPick: async items => items[0],
  },
  commands: { executeCommand: async () => undefined },
}
installModuleMocks({ vscode: vscodeMock })

const { bookmarkRepository } = require('../out/repository/BookmarkRepository')

function envelope(id, scriptPath, content) {
  return {
    script: {
      id,
      path: scriptPath,
      fingerprint: {
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        size: Buffer.byteLength(content),
      },
      lastSeenAt: Date.now(),
    },
    bookmarks: [{
      id: `bookmark-${id}`,
      createdAt: Date.now(),
      label: path.basename(scriptPath),
      path: scriptPath,
      collapsibleState: 0,
      pinned: false,
      content: content.trim(),
      iconName: '',
      isInvalid: false,
      params: '0,0,0,0',
      subs: [],
    }],
  }
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
