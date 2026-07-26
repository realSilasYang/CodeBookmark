/**
 * 构造书签仓库专项验证共用的最小 VS Code 边界。
 * 工作区列表可动态提供，测试仍可覆盖提示行为；仓库本身看不到未使用的完整 VS Code API。
 */
const path = require('node:path')

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

function createRepositoryVscodeMock(options) {
  const folders = () => typeof options.workspaceFolders === 'function'
    ? options.workspaceFolders()
    : options.workspaceFolders
  const getWorkspaceFolder = options.getWorkspaceFolder ?? (uri => (folders() ?? []).find(folder => {
    const relative = path.relative(folder.uri.fsPath, path.resolve(uri.fsPath))
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  }))
  return {
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class {},
    ThemeColor: class {},
    MarkdownString,
    Uri: { file: fsPath => ({ scheme: 'file', fsPath }) },
    workspace: {
      get workspaceFolders() { return folders() },
      textDocuments: [],
      getWorkspaceFolder,
      getConfiguration: section => ({
        get: key => {
          if (section === 'codebookmark' && key === 'globalStoragePath') return options.storageRoot
          if (section === 'codebookmark' && key === 'autoSpace') return true
          return undefined
        },
      }),
    },
    window: {
      activeTextEditor: undefined,
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      showErrorMessage: async () => undefined,
      showWarningMessage: options.showWarningMessage ?? (async () => undefined),
      showInformationMessage: async () => undefined,
      showQuickPick: async items => items[0],
    },
    commands: { executeCommand: async () => undefined },
  }
}

module.exports = { createRepositoryVscodeMock }
