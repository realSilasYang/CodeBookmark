/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-module-graph`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-module-graph` 对应契约。
 * 核心边界：通过断言锁定“verify-module-graph”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`collectSourceFiles`、`resolveInternalModule`、`addDependency`、`importDeclarationIsRuntime`、`exportDeclarationIsRuntime`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(projectRoot, 'src')
const sourceFiles = []

function collectSourceFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) collectSourceFiles(entryPath)
    else if (entry.isFile() && entry.name.endsWith('.ts')) sourceFiles.push(path.resolve(entryPath))
  }
}

collectSourceFiles(sourceRoot)
sourceFiles.sort()
assert.ok(sourceFiles.length > 0, 'No production TypeScript modules were found')

const sourceFileSet = new Set(sourceFiles)
const configPath = path.join(projectRoot, 'config', 'tsconfig.json')
const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
assert.equal(configFile.error, undefined, 'tsconfig.json could not be read')
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath))
assert.deepEqual(parsedConfig.errors, [], 'tsconfig.json could not be parsed')

const allDependencies = new Map(sourceFiles.map(file => [file, new Set()]))
const runtimeDependencies = new Map(sourceFiles.map(file => [file, new Set()]))

function resolveInternalModule(specifier, containingFile) {
  if (!specifier.startsWith('.')) return undefined
  const resolution = ts.resolveModuleName(specifier, containingFile, parsedConfig.options, ts.sys)
  const resolvedFile = resolution.resolvedModule?.resolvedFileName
  if (!resolvedFile) return undefined
  const absolutePath = path.resolve(resolvedFile)
  return sourceFileSet.has(absolutePath) ? absolutePath : undefined
}

function addDependency(containingFile, specifier, runtime) {
  const dependency = resolveInternalModule(specifier, containingFile)
  if (!dependency) return
  allDependencies.get(containingFile).add(dependency)
  if (runtime) runtimeDependencies.get(containingFile).add(dependency)
}

function importDeclarationIsRuntime(statement) {
  const clause = statement.importClause
  if (!clause) return true
  if (clause.isTypeOnly) return false
  if (clause.name) return true
  if (!clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return true
  return clause.namedBindings.elements.some(element => !element.isTypeOnly)
}

function exportDeclarationIsRuntime(statement) {
  if (statement.isTypeOnly) return false
  if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) return true
  return statement.exportClause.elements.some(element => !element.isTypeOnly)
}

for (const file of sourceFiles) {
  const sourceFile = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      addDependency(file, statement.moduleSpecifier.text, importDeclarationIsRuntime(statement))
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier
      && ts.isStringLiteral(statement.moduleSpecifier)) {
      addDependency(file, statement.moduleSpecifier.text, exportDeclarationIsRuntime(statement))
    } else if (ts.isImportEqualsDeclaration(statement)
      && ts.isExternalModuleReference(statement.moduleReference)
      && statement.moduleReference.expression
      && ts.isStringLiteral(statement.moduleReference.expression)) {
      addDependency(file, statement.moduleReference.expression.text, statement.isTypeOnly !== true)
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (isDynamicImport || isRequire) addDependency(file, node.arguments[0].text, true)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
      && ts.isStringLiteral(node.argument.literal)) {
      addDependency(file, node.argument.literal.text, false)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

const entryPoints = [
  path.join(sourceRoot, 'extension.ts'),
  path.join(sourceRoot, 'util', 'constants', 'BasePackage.ts'),
  path.join(sourceRoot, 'util', 'constants', 'Colors.ts'),
].map(file => path.resolve(file))

for (const entryPoint of entryPoints) {
  assert.ok(sourceFileSet.has(entryPoint), `Module graph entry point is missing: ${entryPoint}`)
}

const reachable = new Set()
const pending = [...entryPoints]
while (pending.length > 0) {
  const current = pending.pop()
  if (reachable.has(current)) continue
  reachable.add(current)
  for (const dependency of allDependencies.get(current)) pending.push(dependency)
}

const relativePath = file => path.relative(projectRoot, file).replace(/\\/g, '/')
const unreachable = sourceFiles.filter(file => !reachable.has(file)).map(relativePath)
assert.deepEqual(unreachable, [], `Production modules are unreachable from declared entry points:\n${unreachable.join('\n')}`)

let nextIndex = 0
const indexes = new Map()
const lowLinks = new Map()
const stack = []
const onStack = new Set()
const components = []

function findStronglyConnectedComponents(file) {
  indexes.set(file, nextIndex)
  lowLinks.set(file, nextIndex)
  nextIndex++
  stack.push(file)
  onStack.add(file)

  for (const dependency of runtimeDependencies.get(file)) {
    if (!indexes.has(dependency)) {
      findStronglyConnectedComponents(dependency)
      lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(dependency)))
    } else if (onStack.has(dependency)) {
      lowLinks.set(file, Math.min(lowLinks.get(file), indexes.get(dependency)))
    }
  }

  if (lowLinks.get(file) !== indexes.get(file)) return
  const component = []
  let member
  do {
    member = stack.pop()
    onStack.delete(member)
    component.push(member)
  } while (member !== file)
  components.push(component)
}

for (const file of sourceFiles) {
  if (!indexes.has(file)) findStronglyConnectedComponents(file)
}

const cycles = components
  .filter(component => component.length > 1
    || runtimeDependencies.get(component[0]).has(component[0]))
  .map(component => component.map(relativePath).sort().join(' <-> '))
  .sort()

assert.deepEqual(cycles, [], `Runtime module cycles detected:\n${cycles.join('\n')}`)
console.log(`Module graph contract verified: ${sourceFiles.length} modules reachable, 0 runtime cycles.`)
