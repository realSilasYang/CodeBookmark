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
