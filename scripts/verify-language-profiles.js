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
    // JSONC comments and trailing commas are intentional.
    "comments": {
      "lineComment": ";;",
      "blockComment": ["{-", "-}"],
    },
    "documentation": "https://example.invalid/language//comments",
  }`)],
  ['/extensions/batch/language-configuration.json', Buffer.from(`{
    "comments": { "lineComment": "REM" }
  }`)],
])

const extensions = [
  {
    extensionUri: uri('/extensions/fiction'),
    packageJSON: {
      contributes: {
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
        languages: [{
          id: 'outside',
          extensions: ['.outside'],
          configuration: '../outside.json',
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

;(async () => {
  const parsed = parseLanguageConfigurationJson('{ "url": "https://example.invalid/a//b", /* note */ "items": [1,], }')
  assert.equal(parsed.url, 'https://example.invalid/a//b')
  assert.deepEqual(parsed.items, [1])

  const registry = new LanguageCommentProfileRegistry()
  await registry.initialize()
  assert.equal(registry.isInitialized, true)

  const direct = registry.profileFor('fiction', '/workspace/no-extension')
  const byExtension = registry.profileFor(undefined, '/workspace/story.fic')
  const byCompoundExtension = registry.profileFor(undefined, '/workspace/story.fiction.source')
  const byFilename = registry.profileFor(undefined, '/workspace/Fictionfile')
  const byPattern = registry.profileFor(undefined, '/workspace/view.fiction-template')
  const byNestedPattern = registry.profileFor(undefined, '/workspace/configs/app.fiction')
  assert.ok(direct && byExtension && byCompoundExtension && byFilename && byPattern && byNestedPattern)
  assert.equal(registry.profileFor('outside', '/workspace/file.outside'), undefined)

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

  files.set('/extensions/fiction/language-configuration.json', Buffer.from(`{
    "comments": { "lineComment": "##" }
  }`))
  await registry.reload()
  const reloaded = registry.profileFor('fiction', '/workspace/story.fic')
  assert.deepEqual(
    scanCodeMarkers(['run ;; TODO old', 'run ## FIXME refreshed'], 'fiction', 'story.fic', 100, reloaded).occurrences.map(item => item.marker),
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
