/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-language-profiles`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-language-profiles` 对应契约。
 * 核心边界：通过断言锁定“verify-language-profiles”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`uri`、`captureExpectedLoggerErrors`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { installModuleMocks } = require('./test-support/module-mocks')

function uri(fsPath) {
  const normalized = fsPath.replace(/\\/g, '/')
  return {
    scheme: 'file',
    fsPath: normalized,
    toString: () => `file:${normalized}`,
  }
}

const files = new Map([
  ['/extensions/fiction/language-configuration.json', Buffer.from(`{
    // 这里有意使用 JSONC 注释与尾随逗号，用于验证语言配置解析器的兼容能力。
    "comments": {
      "lineComment": ";;",
      "blockComment": ["{-", "-}"],
    },
    "documentation": "https://example.invalid/language//comments",
  }`)],
  ['/extensions/batch/language-configuration.json', Buffer.from(`{
    "comments": { "lineComment": "REM" }
  }`)],
  ['/extensions/uncolored/language-configuration.json', Buffer.from(`{
    "comments": { "lineComment": "//" }
  }`)],
])

const extensions = [
  {
    extensionUri: uri('/extensions/fiction'),
    packageJSON: {
      contributes: {
        grammars: [{ language: 'fiction', scopeName: 'source.fiction', path: './syntaxes/fiction.tmLanguage.json' }],
        languages: [
          {
            id: 'fiction',
            extensions: ['.fic'],
            configuration: './language-configuration.json',
          },
          {
            id: 'fiction',
            extensions: ['.fiction.source'],
            filenames: ['Fictionfile'],
            filenamePatterns: ['*.fiction-template', 'configs/*.fiction', '[z-a].fiction'],
          },
        ],
      },
    },
  },
  {
    extensionUri: uri('/extensions/batch'),
    packageJSON: {
      contributes: {
        grammars: [{ language: 'bat', scopeName: 'source.batch', path: './syntaxes/batch.tmLanguage.json' }],
        languages: [{
          id: 'bat',
          extensions: ['.cmd'],
          configuration: 'language-configuration.json',
        }],
      },
    },
  },
  {
    extensionUri: uri('/extensions/untrusted'),
    packageJSON: {
      contributes: {
        grammars: [{ language: 'outside', scopeName: 'source.outside', path: './syntaxes/outside.tmLanguage.json' }],
        languages: [{
          id: 'outside',
          extensions: ['.outside'],
          configuration: '../outside.json',
        }],
      },
    },
  },
  {
    extensionUri: uri('/extensions/uncolored'),
    packageJSON: {
      contributes: {
        languages: [{
          id: 'uncolored',
          extensions: ['.uncolored'],
          configuration: 'language-configuration.json',
        }],
      },
    },
  },
]

const vscodeMock = {
  Uri: {
    joinPath: (base, ...segments) => uri(path.posix.join(base.fsPath, ...segments)),
  },
  workspace: {
    fs: {
      stat: async target => {
        const content = files.get(target.fsPath)
        if (!content) throw new Error(`missing ${target.fsPath}`)
        return { size: content.byteLength }
      },
      readFile: async target => {
        const content = files.get(target.fsPath)
        if (!content) throw new Error(`missing ${target.fsPath}`)
        return content
      },
    },
  },
  extensions: { all: extensions },
  window: {
    createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
    showWarningMessage: async () => undefined,
    showInformationMessage: async () => undefined,
  },
}

installModuleMocks({ vscode: vscodeMock })

const { scanCodeMarkers } = require('../out/util/CodeMarkerScanner')
const {
  LanguageCommentProfileRegistry,
  parseLanguageConfigurationJson,
} = require('../out/util/LanguageCommentProfiles')

async function captureExpectedLoggerErrors(operation) {
  const errors = []
  const originalConsoleError = console.error
  console.error = (...args) => errors.push(args)
  try {
    await operation()
  } finally {
    console.error = originalConsoleError
  }
  return errors
}

;(async () => {
  const parsed = parseLanguageConfigurationJson('{ "url": "https://example.invalid/a//b", /* note */ "items": [1,], }')
  assert.equal(parsed.url, 'https://example.invalid/a//b')
  assert.deepEqual(parsed.items, [1])

  const registry = new LanguageCommentProfileRegistry()
  const initializationErrors = await captureExpectedLoggerErrors(() => registry.initialize())
  assert.equal(initializationErrors.length, 1)
  assert.match(String(initializationErrors[0][0]), /已跳过 1 个无效的语言文件匹配模式/)
  assert.equal(registry.isInitialized, true)

  const direct = registry.profileFor('fiction', '/workspace/no-extension')
  const byExtension = registry.profileFor(undefined, '/workspace/story.fic')
  const byCompoundExtension = registry.profileFor(undefined, '/workspace/story.fiction.source')
  const byFilename = registry.profileFor(undefined, '/workspace/Fictionfile')
  const byPattern = registry.profileFor(undefined, '/workspace/view.fiction-template')
  const byNestedPattern = registry.profileFor(undefined, '/workspace/configs/app.fiction')
  assert.ok(direct && byExtension && byCompoundExtension && byFilename && byPattern && byNestedPattern)
  assert.equal(registry.profileFor('outside', '/workspace/file.outside'), undefined)
  assert.equal(registry.profileFor('uncolored', '/workspace/file.uncolored'), undefined)
  assert.equal(registry.profileFor('plaintext', '/workspace/story.fic'), undefined)
  assert.equal(registry.supportsFile('/workspace/story.fic', 'plaintext'), false)
  assert.equal(registry.supportsFile('/workspace/story.fic'), true)

  const lines = [
    'text = ";; TODO inside string"',
    'run ;; TODO: dynamic line comment',
    '{- BUG: dynamic block comment -}',
  ]
  assert.deepEqual(
    scanCodeMarkers(lines, 'fiction', 'story.fic', 100, direct).occurrences.map(item => item.marker),
    ['TODO', 'BUG']
  )

  const batch = registry.profileFor('bat', '/workspace/build.cmd')
  assert.deepEqual(
    scanCodeMarkers(['rem TODO: lower-case command', 'REMARK TODO: not a REM token'], 'bat', 'build.cmd', 100, batch).occurrences.map(item => item.marker),
    ['TODO']
  )

  const globs = registry.discoveryGlobs()
  assert.ok(globs.some(glob => glob.includes('.fic')))
  assert.ok(globs.some(glob => glob.includes('Fictionfile')))
  assert.ok(globs.some(glob => glob.includes('fiction-template')))
  assert.equal(globs.some(glob => glob.includes('uncolored')), false)

  files.set('/extensions/fiction/language-configuration.json', Buffer.from(`{
    "comments": { "lineComment": "##" }
  }`))
  const reloadErrors = await captureExpectedLoggerErrors(() => registry.reload())
  assert.equal(reloadErrors.length, 1)
  assert.match(String(reloadErrors[0][0]), /已跳过 1 个无效的语言文件匹配模式/)
  const reloaded = registry.profileFor('fiction', '/workspace/story.fic')
  assert.deepEqual(
    scanCodeMarkers(['run ;; TODO: old', 'run ## FIXME: refreshed'], 'fiction', 'story.fic', 100, reloaded).occurrences.map(item => item.marker),
    ['FIXME']
  )

  const source = require('node:fs').readFileSync('src/util/LanguageCommentProfiles.ts', 'utf8')
  assert.match(source, /MAX_LANGUAGE_CONFIG_BYTES = 512 \* 1024/)
  assert.match(source, /MAX_LANGUAGE_CONTRIBUTIONS = 4_096/)
  assert.match(source, /MAX_DISCOVERY_GLOBS = 64/)
  assert.match(source, /failedPatterns\+\+/)
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
