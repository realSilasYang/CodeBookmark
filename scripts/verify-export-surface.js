const assert = require('node:assert/strict')
const path = require('node:path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(projectRoot, 'src')
const config = ts.getParsedCommandLineOfConfigFile(
  path.join(projectRoot, 'tsconfig.json'),
  {},
  ts.sys,
)
assert.ok(config, 'tsconfig.json could not be parsed')

const program = ts.createProgram(config.fileNames, config.options)
const checker = program.getTypeChecker()
const sourceFiles = program.getSourceFiles()
  .filter(file => path.resolve(file.fileName).startsWith(`${sourceRoot}${path.sep}`))

const referencedFromFiles = new Map()
const underlyingSymbol = symbol => symbol && (symbol.flags & ts.SymbolFlags.Alias)
  ? checker.getAliasedSymbol(symbol)
  : symbol

for (const sourceFile of sourceFiles) {
  function visit(node) {
    if (ts.isIdentifier(node)) {
      const symbol = underlyingSymbol(checker.getSymbolAtLocation(node))
      if (symbol) {
        let files = referencedFromFiles.get(symbol)
        if (!files) referencedFromFiles.set(symbol, files = new Set())
        files.add(sourceFile.fileName)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

const relativePath = file => path.relative(sourceRoot, file).replace(/\\/g, '/')
const unconsumedExports = []
for (const sourceFile of sourceFiles) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
  if (!moduleSymbol) continue
  for (const exportedSymbol of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = underlyingSymbol(exportedSymbol)
    const consumers = [...(referencedFromFiles.get(symbol) ?? [])]
      .filter(file => file !== sourceFile.fileName)
    if (consumers.length === 0) {
      unconsumedExports.push(`${relativePath(sourceFile.fileName)}#${exportedSymbol.name}`)
    }
  }
}

const externalEntryPoints = [
  'extension.ts#activate',
  'extension.ts#deactivate',
]
const buildEntryPoints = [
  'util/constants/BasePackage.ts#basePackage',
  'util/constants/Colors.ts#Colors',
]
const directTestSeams = [
	'util/AIIconCatalog.ts#AI_BOOKMARK_ICON_OPTIONS',
	'models/SerializedBookmarkTree.ts#serializedBookmarkContentIdentity',
  'providers/UndoManager.ts#UndoManager',
  'repository/ScriptRelocationJournal.ts#createScriptRelocation',
  'util/AIResponseCodec.ts#repairJsonStringEscapes',
  'util/AIResponseCodec.ts#stripMarkdownCodeFence',
  'util/AIService.ts#AIHttpStatusError',
  'util/FileChangeFingerprint.ts#hashContent',
  'util/FingerprintMatcher.ts#scoreFingerprintCandidate',
  'util/LanguageCommentProfiles.ts#parseLanguageConfigurationJson',
  'util/quick_pick_icon/IconPickerWebview.ts#shouldShowRestoreDefaultIcon',
]
const intentionalExports = [...externalEntryPoints, ...buildEntryPoints, ...directTestSeams].sort()

assert.deepEqual(
  unconsumedExports.sort(),
  intentionalExports,
  'The production export surface changed; expose only cross-module APIs or documented entry points/test seams',
)
console.log(`Export surface contract verified: ${intentionalExports.length} intentional external/test entry points.`)
