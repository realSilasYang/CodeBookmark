const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readJson = relativePath => JSON.parse(read(relativePath))
const cjk = /[\u3400-\u9fff]/u

function collectStrings(value, currentPath = [], output = []) {
  if (typeof value === 'string') output.push({ path: currentPath, value })
  else if (Array.isArray(value)) value.forEach((item, index) => collectStrings(item, [...currentPath, String(index)], output))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, [...currentPath, key], output)
  }
  return output
}

const manifest = readJson('package.json')
const englishMessages = readJson('package.nls.json')
const genericChineseMessages = readJson('package.nls.zh.json')
const chineseMessages = readJson('package.nls.zh-cn.json')
const traditionalLocaleMessages = readJson('package.nls.zh-tw.json')
const englishKeys = Object.keys(englishMessages).sort()
assert.deepEqual(Object.keys(genericChineseMessages).sort(), englishKeys, 'Generic Chinese and English NLS catalogs must have identical keys')
assert.deepEqual(Object.keys(chineseMessages).sort(), englishKeys, 'English and Chinese NLS catalogs must have identical keys')
assert.deepEqual(Object.keys(traditionalLocaleMessages).sort(), englishKeys, 'Every zh locale catalog must have identical keys')
assert.deepEqual(genericChineseMessages, chineseMessages, 'Generic zh localization must use the same default Chinese copy')
assert.deepEqual(traditionalLocaleMessages, chineseMessages, 'All zh locales currently use the same default Chinese copy')
assert.ok(englishKeys.length > 100, 'Manifest localization must cover the complete contributed surface')
for (const key of englishKeys) {
  assert.equal(typeof englishMessages[key], 'string')
  assert.equal(typeof chineseMessages[key], 'string')
  assert.doesNotMatch(englishMessages[key], cjk, `Default English NLS value contains Chinese text: ${key}`)
}

const placeholderKeys = collectStrings(manifest)
  .map(entry => /^%([^%]+)%$/.exec(entry.value)?.[1])
  .filter(Boolean)
  .sort()
assert.deepEqual(placeholderKeys, englishKeys, 'Every generated NLS message must be referenced exactly once by package.json')

const { loadLocalizedManifest } = require('./localized-manifest')
const chineseManifest = loadLocalizedManifest('zh-cn')
const englishManifest = loadLocalizedManifest('en-US')
assert.equal(chineseManifest.displayName, '代码书签 - CodeBookmark')
assert.equal(englishManifest.displayName, 'Code Bookmarks - CodeBookmark')
assert.match(chineseManifest.description, /粘性引擎/)
assert.match(englishManifest.description, /sticky engine/i)
for (const entry of collectStrings(englishManifest)) {
  if (entry.path[0] === 'author' || entry.path[0] === 'keywords') continue
  assert.doesNotMatch(entry.value, cjk, `Localized English manifest contains Chinese text at ${entry.path.join('.')}`)
}
for (const requiredFile of ['README.md', 'README.en.md', 'CHANGELOG.md', 'CHANGELOG.en.md']) {
  assert.ok(englishManifest.files.includes(requiredFile), `${requiredFile} must be included in the VSIX`)
}

function manifestBehaviorContract(localizedManifest) {
  const promptDefaults = new Set([
    'codebookmark.AI.prompt',
    'codebookmark.AI.optimizePrompt',
  ])
  const configuration = localizedManifest.contributes.configuration.map(group => ({
    properties: Object.fromEntries(Object.entries(group.properties).map(([key, property]) => {
      const contract = {}
      for (const field of ['type', 'scope', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'enum']) {
        if (property[field] !== undefined) contract[field] = property[field]
      }
      if (!promptDefaults.has(key) && property.default !== undefined) contract.default = property.default
      return [key, contract]
    })),
  }))
  return {
    name: localizedManifest.name,
    version: localizedManifest.version,
    publisher: localizedManifest.publisher,
    main: localizedManifest.main,
    engines: localizedManifest.engines,
    activationEvents: localizedManifest.activationEvents,
    files: localizedManifest.files,
    contributes: {
      viewsContainers: Object.fromEntries(Object.entries(localizedManifest.contributes.viewsContainers ?? {})
        .map(([key, containers]) => [key, containers.map(({ id, icon }) => ({ id, icon }))])),
      views: Object.fromEntries(Object.entries(localizedManifest.contributes.views ?? {})
        .map(([key, views]) => [key, views.map(({ id, icon }) => ({ id, icon }))])),
      viewsWelcome: localizedManifest.contributes.viewsWelcome.map(({ view, when }) => ({ view, when })),
      commands: localizedManifest.contributes.commands
        .map(({ command, icon, enablement, category }) => ({ command, icon, enablement, category })),
      keybindings: localizedManifest.contributes.keybindings
        .map(({ command, key, mac, linux, win, when, args }) => ({ command, key, mac, linux, win, when, args })),
      menus: Object.fromEntries(Object.entries(localizedManifest.contributes.menus)
        .map(([menuId, items]) => [menuId, items.map(({ command, submenu, alt, when, group, icon }) => ({
          command, submenu, alt, when, group, icon,
        }))])),
      submenus: localizedManifest.contributes.submenus.map(({ id, icon }) => ({ id, icon })),
      configuration,
      colors: localizedManifest.contributes.colors.map(({ id, defaults }) => ({ id, defaults })),
    },
  }
}
assert.deepEqual(
  manifestBehaviorContract(englishManifest),
  manifestBehaviorContract(chineseManifest),
  'Localization must not change command IDs, menu conditions, configuration keys/types, or other manifest behavior',
)

const localization = require('../out/i18n/Localization')
const statistics = require('../out/util/BookmarkStatistics')
localization.initializeLocalization('zh-Hans')
assert.equal(localization.currentLanguage(), 'zh-cn')
assert.equal(localization.currentFormattingLocale(), 'zh-CN')
assert.equal(statistics.formatBookmarkLevelSummary({ total: 2, levelCounts: [1, 1] }), '共 2 个书签：一级 1 个、二级 1 个')
localization.initializeLocalization('en-GB')
assert.equal(localization.currentLanguage(), 'en')
assert.equal(localization.currentFormattingLocale(), 'en-US')
assert.equal(statistics.formatBookmarkLevelSummary({ total: 2, levelCounts: [1, 1] }), '2 bookmarks total: Level 1: 1, Level 2: 1')

const allowedChineseDataFiles = new Set([
  'src/util/AIIconCatalog.ts',
  'src/util/BookmarkStatistics.ts',
  'src/util/UndoActions.ts',
  'src/util/constants/AIPrompts.ts',
  'src/util/constants/BasePackage.ts',
  'src/util/constants/Colors.ts',
  'src/util/constants/Commands.ts',
])
const localizedWrappers = new Set(['localize', 'UserCancelledError'])
const sourceFiles = []
function collectTypeScriptFiles(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, item.name)
    if (item.isDirectory()) collectTypeScriptFiles(absolutePath)
    else if (item.isFile() && item.name.endsWith('.ts')) sourceFiles.push(absolutePath)
  }
}
collectTypeScriptFiles(path.join(root, 'src'))

const visibleMethodArguments = new Map([
  ['showInformationMessage', [0]],
  ['showWarningMessage', [0]],
  ['showErrorMessage', [0]],
  ['setStatusBarMessage', [0]],
  ['showQuickPick', [0, 1]],
  ['showInputBox', [0]],
  ['showOpenDialog', [0]],
  ['showSaveDialog', [0]],
  ['withProgress', [0]],
  ['createWebviewPanel', [1]],
  ['createOutputChannel', [0]],
  ['info', [0]],
  ['error', [0]],
  ['showMessage', [0]],
])
const visiblePropertyNames = new Set([
  'description', 'detail', 'label', 'message', 'openLabel', 'placeHolder',
  'placeholder', 'prompt', 'title', 'tooltip',
])
const languageNeutralVisibleText = new Set(['AI', 'CSV', 'CodeBookmark', 'HTML', 'Markdown'])
const violations = []
for (const absolutePath of sourceFiles) {
  const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, '/')
  const source = fs.readFileSync(absolutePath, 'utf8')
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true)
  const localizedIdentifiers = new Set()
  const initializerCandidates = new Map()
  function collectInitializers(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const entries = initializerCandidates.get(node.name.text) ?? []
      entries.push(node.initializer)
      initializerCandidates.set(node.name.text, entries)
    }
    ts.forEachChild(node, collectInitializers)
  }
  collectInitializers(sourceFile)
  const uniqueInitializers = new Map([...initializerCandidates]
    .filter(([, initializers]) => initializers.length === 1)
    .map(([name, initializers]) => [name, initializers[0]]))
  function isTranslatedTextExpression(node) {
    if (ts.isCallExpression(node)) {
      return ts.isIdentifier(node.expression) && node.expression.text === 'localize'
    }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
      || ts.isNonNullExpression(node)) return isTranslatedTextExpression(node.expression)
    if (ts.isConditionalExpression(node)) {
      return isTranslatedTextExpression(node.whenTrue) || isTranslatedTextExpression(node.whenFalse)
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return isTranslatedTextExpression(node.left) || isTranslatedTextExpression(node.right)
    }
    if (ts.isTemplateExpression(node)) {
      return node.templateSpans.some(span => isTranslatedTextExpression(span.expression))
    }
    return false
  }
  function lineOf(node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  }
  function isFunctionBoundary(node) {
    return ts.isArrowFunction(node) || ts.isConstructorDeclaration(node)
      || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      || ts.isGetAccessorDeclaration(node) || ts.isMethodDeclaration(node)
      || ts.isSetAccessorDeclaration(node)
  }
  function isModuleInitialization(node) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (isFunctionBoundary(parent)) return false
    }
    return true
  }
  function propertyName(node) {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text
    return undefined
  }
  function literalText(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isTemplateExpression(node)) {
      return [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join('')
    }
    return undefined
  }
  function checkVisibleExpression(node, methodName, seenIdentifiers = new Set()) {
    if (!node) return
    if (isTranslatedTextExpression(node)) return
    const text = literalText(node)
    if (text !== undefined) {
      const visible = text.replace(/\$\([^)]+\)/g, '').trim()
      const interpolationOnly = !/[A-Za-z\u3400-\u9fff]/u.test(visible)
      const neutralToken = visible.replace(/[:：\s]/g, '')
      if (!interpolationOnly && !languageNeutralVisibleText.has(neutralToken)) {
        violations.push(`${relativePath}:${lineOf(node)} ${methodName} user-visible literal is not localized`)
      }
      if (ts.isTemplateExpression(node)) {
        for (const span of node.templateSpans) checkVisibleExpression(span.expression, methodName, seenIdentifiers)
      }
      return
    }
    if (ts.isIdentifier(node)) {
      if (seenIdentifiers.has(node.text)) return
      const initializer = uniqueInitializers.get(node.text)
      if (initializer) {
        const nextSeen = new Set(seenIdentifiers)
        nextSeen.add(node.text)
        checkVisibleExpression(initializer, methodName, nextSeen)
      }
      return
    }
    if (ts.isSpreadElement(node)) {
      checkVisibleExpression(node.expression, methodName, seenIdentifiers)
      return
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) checkVisibleExpression(element, methodName, seenIdentifiers)
      return
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property) && visiblePropertyNames.has(propertyName(property.name))) {
          checkVisibleExpression(property.initializer, methodName, seenIdentifiers)
        }
      }
      return
    }
    if (ts.isConditionalExpression(node)) {
      checkVisibleExpression(node.whenTrue, methodName, seenIdentifiers)
      checkVisibleExpression(node.whenFalse, methodName, seenIdentifiers)
      return
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      for (const argument of node.arguments ?? []) checkVisibleExpression(argument, methodName, seenIdentifiers)
    }
  }
  function visit(node, insideLocalization = false) {
    const isWrapperCall = (ts.isCallExpression(node) || ts.isNewExpression(node))
      && ts.isIdentifier(node.expression) && localizedWrappers.has(node.expression.text)
    const localized = insideLocalization || isWrapperCall
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'localize') {
      if (node.arguments.length !== 2) violations.push(`${relativePath}:${lineOf(node)} localize() must have exactly two arguments`)
      const englishArgument = node.arguments[1]
      if (englishArgument && cjk.test(englishArgument.getText(sourceFile))) {
        violations.push(`${relativePath}:${lineOf(englishArgument)} English localize() argument contains Chinese text`)
      }
      if (isModuleInitialization(node)) {
        violations.push(`${relativePath}:${lineOf(node)} localize() must not run during module initialization`)
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && isTranslatedTextExpression(node.initializer)) {
      localizedIdentifiers.add(node.name.text)
    }
    if (ts.isBinaryExpression(node) && [
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ].includes(node.operatorToken.kind)) {
      const translatedOperand = operand => isTranslatedTextExpression(operand)
        || (ts.isIdentifier(operand) && localizedIdentifiers.has(operand.text))
      if (translatedOperand(node.left) || translatedOperand(node.right)) {
        violations.push(`${relativePath}:${lineOf(node)} translated text must not participate in equality checks`)
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text
      const argumentIndexes = visibleMethodArguments.get(methodName)
      if (argumentIndexes) {
        for (const argumentIndex of argumentIndexes) {
          if (node.arguments[argumentIndex]) checkVisibleExpression(node.arguments[argumentIndex], methodName)
        }
      }
    }
    const stringNode = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
    if (stringNode && cjk.test(node.text || '') && !localized) {
      const isFontFamily = relativePath === 'src/providers/CodeBookmarkViewProvider.ts'
        && node.text.includes('霞鹜文楷')
      if (!allowedChineseDataFiles.has(relativePath) && !isFontFamily) {
        violations.push(`${relativePath}:${lineOf(node)} Chinese runtime string is outside a localization wrapper`)
      }
    }
    ts.forEachChild(node, child => visit(child, localized))
  }
  visit(sourceFile)
}
assert.deepEqual(violations, [], violations.join('\n'))

const prompts = require('../out/util/constants/AIPrompts')
for (const [chineseName, englishName] of [
  ['DEFAULT_AI_GENERATION_PROMPT', 'DEFAULT_AI_GENERATION_PROMPT_EN'],
  ['DEFAULT_AI_OPTIMIZATION_PROMPT', 'DEFAULT_AI_OPTIMIZATION_PROMPT_EN'],
  ['AI_GENERATION_ICON_RUNTIME_CONTRACT', 'AI_GENERATION_ICON_RUNTIME_CONTRACT_EN'],
  ['AI_OPTIMIZATION_ICON_RUNTIME_CONTRACT', 'AI_OPTIMIZATION_ICON_RUNTIME_CONTRACT_EN'],
]) {
  assert.equal(typeof prompts[chineseName], 'string', `${chineseName} must exist`)
  assert.equal(typeof prompts[englishName], 'string', `${englishName} must exist`)
  assert.match(prompts[chineseName], cjk)
  assert.doesNotMatch(prompts[englishName], cjk)
}
const undo = require('../out/util/UndoActions')
assert.deepEqual(Object.keys(undo.UNDO_ACTION_LABELS_EN).sort(), Object.keys(undo.UNDO_ACTION_LABELS).sort())
for (const label of Object.values(undo.UNDO_ACTION_LABELS_EN)) assert.doesNotMatch(label, cjk)
const icons = require('../out/util/AIIconCatalog')
assert.doesNotMatch(icons.AI_ICON_SELECTION_PROMPT_EN, cjk)
assert.match(icons.AI_ICON_SELECTION_PROMPT, cjk)

const documentPairs = [
  ['README.md', 'README.en.md'],
  ['CHANGELOG.md', 'CHANGELOG.en.md'],
  ['docs/RELEASING.md', 'docs/RELEASING.en.md'],
  ['docs/CHANGELOG_TEMPLATE.md', 'docs/CHANGELOG_TEMPLATE.en.md'],
  ['.github/CONTRIBUTING.md', '.github/CONTRIBUTING.en.md'],
  ['.github/SECURITY.md', '.github/SECURITY.en.md'],
  ['.github/SUPPORT.md', '.github/SUPPORT.en.md'],
  ['.github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.en.md'],
]
for (const [chineseDocument, englishDocument] of documentPairs) {
  assert.ok(fs.statSync(path.join(root, chineseDocument)).isFile())
  assert.ok(fs.statSync(path.join(root, englishDocument)).isFile())
  assert.match(read(chineseDocument), new RegExp(path.basename(englishDocument).replaceAll('.', '\\.')))
  assert.match(read(englishDocument), new RegExp(path.basename(chineseDocument).replaceAll('.', '\\.')))
}
for (const [chineseTemplate, englishTemplate] of [
  ['.github/ISSUE_TEMPLATE/bug-report--zh-cn.md', '.github/ISSUE_TEMPLATE/bug-report.md'],
  ['.github/ISSUE_TEMPLATE/feature-request--zh-cn.md', '.github/ISSUE_TEMPLATE/feature-request.md'],
  ['.github/ISSUE_TEMPLATE/improvement--zh-cn.md', '.github/ISSUE_TEMPLATE/improvement.md'],
]) {
  assert.match(read(chineseTemplate), cjk)
  assert.doesNotMatch(read(englishTemplate), cjk)
}
assert.match(read('.github/ISSUE_TEMPLATE/config.yml'), /私密报告安全漏洞/)
assert.match(read('.github/ISSUE_TEMPLATE/config.yml'), /Report a security vulnerability privately/)
const chineseVersions = [...read('CHANGELOG.md').matchAll(/^## 🎉 版本 (\S+) - \d{4}-\d{2}-\d{2}$/gm)].map(match => match[1])
const englishVersions = [...read('CHANGELOG.en.md').matchAll(/^## 🎉 Version (\S+) - \d{4}-\d{2}-\d{2}$/gm)].map(match => match[1])
assert.deepEqual(englishVersions, chineseVersions, 'Chinese and English changelogs must cover the same versions')
assert.match(read('README.en.md'), /^# User Guide$/m)
assert.match(read('README.en.md'), /^# Developer Guide$/m)
assert.match(read('README.en.md'), /Runtime Chinese\/English language selection/)

localization.initializeLocalization('zh-cn')
console.log('Complete Chinese/English localization contract verified.')
