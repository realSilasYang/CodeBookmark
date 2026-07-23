const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')

function visibleText(value) {
  return value
    .replace(/\$\([^)]+\)/g, '')
    .replace(/\]\([^)]*\)/g, ']')
}

const manifestText = [
  ...manifest.contributes.commands.map(command => command.title),
  ...manifest.contributes.submenus.map(submenu => submenu.label),
  ...manifest.contributes.viewsWelcome.map(welcome => welcome.contents),
  ...Object.values(manifest.contributes.viewsContainers ?? {})
    .flatMap(containers => containers.map(container => container.title)),
  ...Object.values(manifest.contributes.views ?? {})
    .flatMap(views => views.map(view => view.name)),
]
for (const group of manifest.contributes.configuration) {
  if (group.title) manifestText.push(group.title)
  for (const setting of Object.values(group.properties)) {
    if (setting.description) manifestText.push(setting.description)
    if (setting.markdownDescription) manifestText.push(setting.markdownDescription)
    if (setting.enumDescriptions) manifestText.push(...setting.enumDescriptions)
    if (setting.markdownEnumDescriptions) manifestText.push(...setting.markdownEnumDescriptions)
  }
}
for (const text of manifestText) {
  assert.doesNotMatch(visibleText(text), /[()]/, `用户可见文本包含半角圆括号：${text}`)
}

const userVisibleCalls = new Set([
  'error',
  'setStatusBarMessage',
  'showErrorMessage',
  'showInformationMessage',
  'showInputBox',
  'showMessage',
  'showQuickPick',
  'showWarningMessage',
  'withProgress',
])
const userVisibleProperties = new Set([
  'description',
  'detail',
  'label',
  'placeHolder',
  'placeholder',
  'prompt',
  'title',
  'tooltip',
])
const stringNodeKinds = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
])

function sourceFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(folder, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : []
  })
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return undefined
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
  return undefined
}

for (const file of sourceFiles('src')) {
  const source = fs.readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

  const checkTextNodes = node => {
    if (ts.isCallExpression(node) && callName(node.expression) === 'localize') {
      if (node.arguments[0]) checkTextNodes(node.arguments[0])
      return
    }
    if (stringNodeKinds.has(node.kind)) {
      const text = visibleText(node.text)
      if (!/[\u3400-\u9fff]/u.test(text)) return
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      assert.doesNotMatch(
        text,
        /[()]/,
        `User-visible source text contains ASCII parentheses at ${file}:${position.line + 1}: ${node.text}`,
      )
    }
    ts.forEachChild(node, checkTextNodes)
  }

  const visit = node => {
    if (ts.isCallExpression(node) && userVisibleCalls.has(callName(node.expression))) {
      for (const argument of node.arguments) checkTextNodes(argument)
    }
    if (ts.isPropertyAssignment(node) && userVisibleProperties.has(propertyName(node.name))) {
      checkTextNodes(node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

for (const file of [
  'src/providers/CodeBookmarkViewProvider.ts',
  'src/repository/BookmarkRepository.ts',
  'src/subscriptions/fileEditorSubscriber.ts',
]) {
  const source = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(source, /[\u4e00-\u9fff][^\n`]* \(\$\{/, `${file} 的用户可见日志包含半角圆括号`)
}
