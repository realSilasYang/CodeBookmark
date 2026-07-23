/**
 * 模块说明：本文件负责验证脚本共享测试替身，具体对象为 `vscode-fake`。
 *
 * 实现要点：提供最小 VS Code 替身与模块注入工具，使专项验证不依赖真实宿主。
 * 核心边界：脚本失败时应以非零状态退出，且不得静默改写不属于本任务的用户文件。
 * 主要入口：`merge`、`createVscodeFake`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const path = require('node:path')

function merge(base, overrides) {
  return { ...base, ...overrides }
}

function createVscodeFake(overrides = {}) {
  const contextValues = new Map()

  class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label
      this.collapsibleState = collapsibleState
    }
  }

  class MarkdownString {
    constructor() {
      this.value = ''
      this.supportThemeIcons = false
    }

    appendMarkdown(value) { this.value += value }
    appendText(value) { this.value += value }
    appendCodeblock(value) { this.value += value }
  }

  class EventEmitter {
    constructor() {
      this.listeners = new Set()
      this.event = listener => {
        this.listeners.add(listener)
        return { dispose: () => this.listeners.delete(listener) }
      }
    }

    fire(value) {
      for (const listener of this.listeners) listener(value)
    }

    dispose() {
      this.listeners.clear()
    }
  }

  const workspace = merge({
    workspaceFolders: [],
    textDocuments: [],
    getConfiguration: () => ({ get: () => undefined }),
    getWorkspaceFolder: () => undefined,
  }, overrides.workspace)

  const window = merge({
    activeTextEditor: undefined,
    visibleTextEditors: [],
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
  }, overrides.window)

  const commands = merge({
    executeCommand: async (command, key, value) => {
      if (command === 'setContext') contextValues.set(key, value)
    },
  }, overrides.commands)

  const vscode = {
    env: merge({ sessionId: 'contract-test-session' }, overrides.env),
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class {
      constructor(id, color) { this.id = id; this.color = color }
    },
    ThemeColor: class {
      constructor(id) { this.id = id }
    },
    MarkdownString,
    EventEmitter,
    Uri: {
      file: fsPath => ({ scheme: 'file', fsPath }),
      joinPath: (base, ...segments) => ({ scheme: base.scheme ?? 'file', fsPath: path.join(base.fsPath, ...segments) }),
    },
    workspace,
    window,
    commands,
    ...overrides,
  }

  vscode.workspace = workspace
  vscode.window = window
  vscode.commands = commands
  return { vscode, contextValues }
}

module.exports = { createVscodeFake }
