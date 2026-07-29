/**
 * 核对稳定键目录、占位符、运行时调用、扩展清单和中英文文档，阻止双文本旧接口回归。
 * 业务源码只能引用静态目录键；新增语言不应要求修改功能模块或增加语言条件分支。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const {
  CHINESE_MANIFEST_LOCALES,
  GENERATED_NLS_PATTERN,
  NON_CHINESE_MANIFEST_ALIASES,
  OFFICIAL_NON_CHINESE_MANIFEST_LOCALES,
  buildManifestLocalizationFiles,
  discoverManifestCatalogs,
} = require('./lib/manifest-language-catalogs')

const root = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const readJson = relativePath => JSON.parse(read(relativePath))
const cjk = /[\u3400-\u9fff]/u
const supportedLocales = Object.freeze([
  'zh-cn', 'zh-hk', 'zh-tw', 'en',
  'ja', 'vi', 'ko', 'es', 'fr', 'pt', 'ru', 'de', 'it',
])
const cjkFreeLocales = new Set(['en', 'vi', 'ko', 'es', 'fr', 'pt', 'ru', 'de', 'it'])
const targetLocalePatterns = Object.freeze({
  'zh-hk': /[\u3400-\u9fff]/u,
  'zh-tw': /[\u3400-\u9fff]/u,
  ja: /[\u3040-\u30ff]/u,
  ko: /[\uac00-\ud7af]/u,
  es: /[áéíóúüñ¿¡]/iu,
  fr: /[àâçéèêëîïôùûüÿœ]/iu,
  pt: /[áâãàçéêíóôõú]/iu,
  de: /[äöüß]/iu,
  ru: /[\u0400-\u04ff]/u,
  vi: /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/iu,
  it: /[àèéìíîòóùú]/iu,
})
const knownMechanicalTranslationArtifacts = Object.freeze({
  'zh-hk': /演演|網網|名稱稱|流程程|終端機機|第第一級|原始原始碼|軟體|遠端|電子郵件|發布|成長|金鑰|隱私|號誌|人工智慧|模型推論|政策治理|法規遵循|影像|錄影|租用戶|順序|監視器/u,
  'zh-tw': /演演|網網|名稱稱|流程程|終端機機|第第一級|原始原始碼|網絡|遙距|軟件|電郵|發佈|增長|密鑰|私隱|信號量|人工智能|模型推理|政策管治|圖像|錄像|租戶|次序|監察器|相應/u,
  es: /archivos fallaron|estado rehecho|estado deshecho/iu,
  pt: /importó|importaron|vinculó|\bAbrao\b|substituirán|terminar importação|foram seguirá|foram voltaram|foram detetou|aa ordem|os alterações|os novas|a separador|ao diário|ao aparecer/iu,
  it: /file non riusciti|stato ripetuto/iu,
})
const languageNeutralManifestKeys = new Set([
  'codebookmark.displayName',
  'codebookmark.contributes.commands.codebookmark.openHelp.title',
])
const languageNeutralRuntimeKeys = new Set([
  'bookmarkStatistics.levelCount',
  'common.listSeparator',
  'commands.exportCommand.code',
  'commands.exportCommand.code2',
  'commands.exportCommand.message',
  'commands.exportCommand.status',
  'models.BookmarkTreeItemPresentation.source',
  'providers.BookmarkConfigurationManagementController.message',
  'providers.BookmarkConfigurationManagerWebview.message',
  'providers.BookmarkConfigurationManagerWebview.status',
  'providers.BookmarkDeletionWorkflowRunner.cancel',
  'util.AIHttpTransport.requestAddress',
  'util.Logger.error',
  'util.Logger.info',
  'util.PerformanceMonitor.perfDurationms',
  'util.quickpickicon.IconPickerWebview.architecture',
  'util.quickpickicon.IconPickerWebview.codebookmark',
])

function assertNoKnownMechanicalTranslationArtifacts(locale, messages, surface) {
  const pattern = knownMechanicalTranslationArtifacts[locale]
  if (!pattern) return
  assert.doesNotMatch(
    Object.values(messages).join('\n'),
    pattern,
    `${locale} ${surface} contains a known mechanical-translation artifact`,
  )
}

function collectStrings(value, currentPath = [], output = []) {
  if (typeof value === 'string') output.push({ path: currentPath, value })
  else if (Array.isArray(value)) value.forEach((item, index) => collectStrings(item, [...currentPath, String(index)], output))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, [...currentPath, key], output)
  }
  return output
}

const schemaFields = [
  'anchor', 'bookmarks', 'canAssignIcon', 'children', 'collapsibleState', 'content',
  'contextAfter', 'contextBefore', 'createdAt', 'icon', 'iconName', 'id', 'label',
  'line', 'lineNumber', 'new_label', 'params', 'path', 'pinned',
]
const technicalTokenPatterns = [
  /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*/gu,
  /\(command:[^)]+\)/gu,
  /`[^`\r\n]+`/gu,
  /\$\([^)]+\)/gu,
  /%[A-Za-z_][A-Za-z0-9_]*%/gu,
  /\b(?:Ctrl|Alt|Shift|Cmd|Command|Option|Meta)(?:\+[A-Za-z0-9]+)+\b/gu,
  new RegExp('"(?:' + schemaFields.join('|') + ')"(?=\\s*:)', 'gu'),
]
function technicalTokens(message) {
  return technicalTokenPatterns.flatMap(pattern => [...message.matchAll(pattern)].map(match => {
    const token = match[0]
    return token.startsWith('http') ? token.replace(/[.,;:!?]+$/u, '') : token
  })).sort()
}

function assertProtocolFields(message, requiredFields, context) {
  for (const field of requiredFields) {
    assert.match(
      message,
      new RegExp('(?:^|[^A-Za-z0-9_])' + field + '(?=$|[^A-Za-z0-9_])', 'u'),
      `${context} must preserve protocol field ${field}`,
    )
  }
}

const generationProtocolFields = Object.freeze([
  'anchor', 'bookmarks', 'children', 'collapsibleState', 'content', 'contextAfter',
  'contextBefore', 'createdAt', 'icon', 'iconName', 'id', 'label', 'line',
  'lineNumber', 'params', 'path', 'pinned',
])
const optimizationProtocolFields = Object.freeze(['icon', 'id', 'new_label'])

const manifest = readJson('package.json')
const defaultChineseMessages = readJson('package.nls.json')
const englishMessages = readJson('package.nls.en.json')
const genericChineseMessages = readJson('package.nls.zh.json')
const chineseMessages = readJson('package.nls.zh-cn.json')
const sourceManifestCatalogs = discoverManifestCatalogs(path.join(root, 'scripts', 'i18n', 'catalogs'))
assert.deepEqual(
  [...sourceManifestCatalogs.keys()].sort(),
  [...supportedLocales].sort(),
  'Manifest source catalogs must exactly cover every supported interface language',
)
const englishManifestSource = sourceManifestCatalogs.get('en')
const sourceManifestKeys = Object.keys(sourceManifestCatalogs.get('zh-cn')).sort()
assert.equal(sourceManifestKeys.length, 126, 'Every manifest source catalog must contain all 126 stable keys')
const manifestGenerationPromptKey = 'codebookmark.contributes.configuration.main.properties.codebookmark.AI.prompt.default'
const manifestOptimizationPromptKey = 'codebookmark.contributes.configuration.main.properties.codebookmark.AI.optimizePrompt.default'
for (const [locale, messages] of sourceManifestCatalogs) {
  assert.deepEqual(Object.keys(messages).sort(), sourceManifestKeys, `${locale} manifest source keys must match Chinese`)
  assertProtocolFields(messages[manifestGenerationPromptKey], generationProtocolFields, `${locale} manifest generation prompt`)
  assertProtocolFields(messages[manifestOptimizationPromptKey], optimizationProtocolFields, `${locale} manifest optimization prompt`)
  if (cjkFreeLocales.has(locale)) {
    for (const [key, message] of Object.entries(messages)) {
      assert.doesNotMatch(message, cjk, `${locale} manifest contains Chinese text: ${key}`)
    }
  }
}
for (const locale of supportedLocales.filter(locale => !['zh-cn', 'en'].includes(locale))) {
  const messages = sourceManifestCatalogs.get(locale)
  assert.notDeepEqual(messages, englishManifestSource, `${locale} manifest catalog must not duplicate English`)
  assertNoKnownMechanicalTranslationArtifacts(locale, messages, 'manifest catalog')
  for (const key of Object.keys(englishManifestSource)) {
    if (messages[key] === englishManifestSource[key]) {
      assert.ok(
        languageNeutralManifestKeys.has(key),
        `${locale} manifest message still duplicates untranslated English: ${key}`,
      )
    }
    assert.deepEqual(
      technicalTokens(messages[key]),
      technicalTokens(englishManifestSource[key]),
      `Manifest technical-token mismatch: ${locale} -> ${key}`,
    )
    assert.doesNotMatch(messages[key], /ZXQ\d+QXZ|CBSEG\d+|CBPROTECT\w*/u, `${locale} manifest contains a translation marker`)
  }
}
const expectedLocalizationFiles = buildManifestLocalizationFiles(sourceManifestCatalogs)
const englishKeys = Object.keys(englishMessages).sort()
assert.deepEqual(Object.keys(defaultChineseMessages).sort(), englishKeys, 'Default Chinese and English NLS catalogs must have identical keys')
assert.deepEqual(Object.keys(genericChineseMessages).sort(), englishKeys, 'Generic Chinese and English NLS catalogs must have identical keys')
assert.deepEqual(Object.keys(chineseMessages).sort(), englishKeys, 'English and Chinese NLS catalogs must have identical keys')
assert.deepEqual(genericChineseMessages, chineseMessages, 'Generic zh localization must use the same default Chinese copy')
assert.deepEqual(defaultChineseMessages, chineseMessages, 'The fallback manifest catalog must be complete Chinese')
assert.ok(englishKeys.length > 100, 'Manifest localization must cover the complete contributed surface')
for (const key of englishKeys) {
  assert.equal(typeof englishMessages[key], 'string')
  assert.equal(typeof chineseMessages[key], 'string')
  assert.doesNotMatch(englishMessages[key], cjk, `English NLS value contains Chinese text: ${key}`)
}
for (const [fileName, messages] of expectedLocalizationFiles) {
  assert.deepEqual(readJson(fileName), messages, fileName + ' must match its discovered source catalog or fallback')
}
const generatedLocalizationFiles = fs.readdirSync(root)
  .filter(fileName => GENERATED_NLS_PATTERN.test(fileName))
  .sort()
assert.deepEqual(
  generatedLocalizationFiles,
  [...expectedLocalizationFiles.keys()].sort(),
  'Generated NLS files must exactly match discovered catalogs and explicit locale fallbacks',
)

const placeholderKeys = collectStrings(manifest)
  .map(entry => /^%([^%]+)%$/.exec(entry.value)?.[1])
  .filter(Boolean)
assert.deepEqual([...new Set(placeholderKeys)].sort(), englishKeys, 'Every generated NLS message must be referenced by package.json')

const { loadLocalizedManifest } = require('./lib/localized-manifest')
const chineseManifest = loadLocalizedManifest('zh-cn')
const englishManifest = loadLocalizedManifest('en-US')
assert.equal(chineseManifest.displayName, '代码书签 - CodeBookmark')
assert.equal(englishManifest.displayName, 'CodeBookmark')
const marketplaceDescriptionContracts = {
  'zh-cn': [/智能导航/u, /符合你的直觉/u, /自研粘性引擎/u, /准确跟随代码.*持续绑定脚本/u, /本地保存/u, /强大的 AI 辅助/u, /丰富的图标.*自定义选项/u],
  'zh-hk': [/智能程式碼導覽/u, /符合你的直覺/u, /自研錨定引擎/u, /準確跟隨程式碼.*持續綁定指令碼/u, /本機儲存/u, /強大的 AI 輔助/u, /豐富圖示.*自訂選項/u],
  'zh-tw': [/智慧程式碼導覽/u, /符合你的直覺/u, /自研錨定引擎/u, /精準跟隨程式碼.*持續綁定指令碼/u, /本機儲存/u, /強大的 AI 輔助/u, /豐富圖示.*自訂選項/u],
  en: [/intelligent code navigation/iu, /feels intuitive/iu, /in-house anchoring engine/iu, /precisely aligned.*persistently bound/iu, /local storage/iu, /powerful AI assistance/iu, /rich icon library.*customization/iu],
  ja: [/スマートなコードナビゲーション/u, /直感に沿う/u, /独自開発のアンカーエンジン/u, /正確に追従.*結び付きを保/u, /ローカル保存/u, /強力な AI 支援/u, /豊富なアイコン.*カスタマイズ/u],
  vi: [/điều hướng mã thông minh/iu, /trực giác/iu, /tự phát triển/iu, /bám chính xác.*luôn gắn/iu, /lưu cục bộ/iu, /AI mạnh mẽ/iu, /biểu tượng phong phú.*cá nhân hóa/iu],
  ko: [/스마트한 코드 탐색/u, /직관에 맞는/u, /자체 개발한 앵커 엔진/u, /정확히 따라가게.*연결을 꾸준히 유지/u, /로컬 저장/u, /강력한 AI 지원/u, /풍부한 아이콘.*사용자 설정/u],
  es: [/navegación inteligente por el código/iu, /se siente natural/iu, /desarrollado internamente/iu, /sigan el código con precisión.*permanezcan vinculados/iu, /almacenamiento local/iu, /potente asistencia de IA/iu, /iconos.*personalización/iu],
  fr: [/navigation intelligente dans le code/iu, /fidèle à votre intuition/iu, /développé en interne/iu, /suivre précisément le code.*restant liés/iu, /stockage local/iu, /puissante assistance IA/iu, /icônes.*personnalisation/iu],
  pt: [/navegação inteligente pelo código/iu, /acompanha a sua intuição/iu, /desenvolvido internamente/iu, /seguirem o código com precisão.*permanecerem vinculados/iu, /armazenamento local/iu, /assistência avançada de IA/iu, /ícones.*personalização/iu],
  ru: [/умной навигации по коду/iu, /вашей интуиции/iu, /Собственный механизм привязки/iu, /точно следовать.*оставаться связанными/iu, /локальное хранение/iu, /мощные возможности ИИ/iu, /набор значков.*настройка/iu],
  de: [/intelligente Codenavigation/iu, /intuitiv anfühlt/iu, /eigens entwickelte Anker-Engine/iu, /präzise folgen.*dauerhaft.*gebunden/iu, /Lokale Speicherung/iu, /leistungsstarke KI-Unterstützung/iu, /Symbole.*Anpassungen/iu],
  it: [/navigazione intelligente del codice/iu, /in sintonia con il tuo intuito/iu, /sviluppato internamente/iu, /con precisione.*legati agli script/iu, /salvataggio locale/iu, /potenti funzioni IA/iu, /icone.*personalizzazione/iu],
}
assert.deepEqual(Object.keys(marketplaceDescriptionContracts), supportedLocales)
for (const [locale, patterns] of Object.entries(marketplaceDescriptionContracts)) {
  const description = loadLocalizedManifest(locale).description
  assert.ok([...description].length <= 500, `${locale} Marketplace description must remain concise`)
  for (const pattern of patterns) {
    assert.match(description, pattern, `${locale} Marketplace description is missing the intended product positioning: ${pattern}`)
  }
}
const languageSetting = englishManifest.contributes.configuration
  .flatMap(group => Object.entries(group.properties))
  .find(([key]) => key === 'codebookmark.language')?.[1]
assert.equal(languageSetting, undefined, 'The removed manual interface-language setting must not be contributed')
assert.match(
  read('src/extension.ts'),
  /initializeLocalization\(vscode\.env\.language\)/u,
  'Activation must initialize runtime localization directly from the VS Code display language',
)
for (const relativePath of [
  'src/util/constants/Commands.ts',
  'src/extension.ts',
  'src/subscriptions/fileEditorSubscriber.ts',
  'scripts/integration/run-integration-tests.js',
  'README.md',
  'docs/README.en.md',
]) {
  assert.doesNotMatch(read(relativePath), /codebookmark\.language/u, `${relativePath} retains the removed language setting`)
}

const englishFallbackLocales = OFFICIAL_NON_CHINESE_MANIFEST_LOCALES
	.filter(locale => !sourceManifestCatalogs.has(locale) && !NON_CHINESE_MANIFEST_ALIASES[locale])
for (const locale of [...englishFallbackLocales, 'en-US']) {
  const localizedManifest = loadLocalizedManifest(locale)
  assert.equal(localizedManifest.displayName, 'CodeBookmark', `${locale} must use the concise English title`)
  for (const entry of collectStrings(localizedManifest)) {
    if (entry.path[0] === 'author' || entry.path[0] === 'keywords') continue
    assert.doesNotMatch(entry.value, cjk, `${locale} manifest contains Chinese text at ${entry.path.join('.')}`)
  }
}
assert.deepEqual(
	readJson('package.nls.pt-br.json'),
	expectedLocalizationFiles.get('package.nls.pt-br.json'),
	'pt-BR manifest localization must use the manually reviewed Portuguese catalog',
)
assert.match(
	loadLocalizedManifest('pt-BR').description,
	/ancoragem/iu,
	'pt-BR must resolve to the manually reviewed Portuguese manifest instead of English',
)
for (const locale of supportedLocales.filter(locale => !['zh-cn', 'zh-hk', 'zh-tw', 'en'].includes(locale))) {
	const localizedManifest = loadLocalizedManifest(locale)
  assert.equal(localizedManifest.displayName, 'CodeBookmark', `${locale} must keep the concise product title`)
  assert.match(
    Object.values(sourceManifestCatalogs.get(locale)).join('\n'),
    targetLocalePatterns[locale],
    `${locale} manifest catalog does not contain characteristic target-language text`,
  )
}
for (const locale of CHINESE_MANIFEST_LOCALES) {
  const localizedManifest = loadLocalizedManifest(locale)
  assert.match(localizedManifest.displayName, /CodeBookmark/u, locale + ' must use the localized Chinese title')
  assert.match(localizedManifest.displayName, cjk, locale + ' must use the localized Chinese title')
}
for (const entry of collectStrings(englishManifest)) {
  if (entry.path[0] === 'author' || entry.path[0] === 'keywords') continue
  assert.doesNotMatch(entry.value, cjk, `Localized English manifest contains Chinese text at ${entry.path.join('.')}`)
}
const { readmeDocumentForLanguage, README_DOCUMENTS } = require(path.join(root, 'out', 'i18n', 'ReadmeDocuments'))
const README_DOCUMENT_BY_LANGUAGE = Object.fromEntries(
  supportedLocales.map(locale => [locale, readmeDocumentForLanguage(locale)]),
)
for (const requiredFile of [...README_DOCUMENTS, 'CHANGELOG.md', 'docs/CHANGELOG.en.md']) {
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
        .map(({ command, icon, enablement }) => ({ command, icon, enablement })),
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
for (const locale of supportedLocales.filter(locale => locale !== 'zh-cn')) {
  assert.deepEqual(
    manifestBehaviorContract(loadLocalizedManifest(locale)),
    manifestBehaviorContract(chineseManifest),
    `${locale} localization must preserve every manifest behavior field`,
  )
}

const localization = require('../out/i18n/Localization')
const statistics = require('../out/util/BookmarkStatistics')
const runtimeCatalogFileNames = fs.readdirSync(path.join(root, 'src', 'i18n', 'catalogs'))
  .filter(fileName => fileName.endsWith('.ts'))
  .sort()
const runtimeCatalogLocales = runtimeCatalogFileNames.map(fileName => path.basename(fileName, '.ts'))
assert.deepEqual(
  runtimeCatalogLocales,
  [...supportedLocales].sort(),
  'Runtime catalogs must exactly cover every supported interface language',
)
const runtimeCatalogSourcePaths = new Set(runtimeCatalogFileNames
  .map(fileName => 'src/i18n/catalogs/' + fileName))
const localizationSourceFile = ts.createSourceFile(
  'src/i18n/Localization.ts',
  read('src/i18n/Localization.ts'),
  ts.ScriptTarget.Latest,
  true,
)
let registeredRuntimeLocales
function findCatalogRegistry(node) {
  const initializer = ts.isVariableDeclaration(node) && node.initializer
    && ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
    && node.name.text === 'catalogs' && ts.isObjectLiteralExpression(initializer)) {
    registeredRuntimeLocales = initializer.properties.map(property => {
      if (ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) return property.name.text
      throw new Error('Runtime catalog registry must use explicit locale properties')
    })
  }
  ts.forEachChild(node, findCatalogRegistry)
}
findCatalogRegistry(localizationSourceFile)
assert.ok(registeredRuntimeLocales, 'Localization.ts must declare the runtime catalog registry')
assert.deepEqual(
  registeredRuntimeLocales.sort(),
  runtimeCatalogLocales,
  'Every runtime catalog file must be registered, and every registered locale must have a catalog file',
)
const runtimeCatalogs = new Map(runtimeCatalogLocales.map(locale => {
  const catalogModule = require('../out/i18n/catalogs/' + locale)
  assert.deepEqual(Object.keys(catalogModule), ['messages'], locale + ' runtime catalog must export only messages')
  return [locale, catalogModule.messages]
}))
const runtimeChineseMessages = runtimeCatalogs.get('zh-cn')
const runtimeEnglishMessages = runtimeCatalogs.get('en')
const runtimeKeys = Object.keys(runtimeChineseMessages).sort()
assert.ok(runtimeKeys.length > 600, 'Runtime catalogs must cover the complete extension surface')
const placeholders = message => [...message.matchAll(/\{([A-Za-z_$][\w$]*)\}/g)].map(match => match[1]).sort()
for (const fileName of runtimeCatalogFileNames) {
  const relativePath = 'src/i18n/catalogs/' + fileName
  const sourceText = read(relativePath)
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true)
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(candidate => ts.isIdentifier(candidate.name) && candidate.name.text === 'messages')
  assert.ok(declaration?.initializer, `${relativePath} must explicitly declare messages`)
  let initializer = declaration.initializer
  while (ts.isSatisfiesExpression(initializer) || ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
    initializer = initializer.expression
  }
  assert.ok(ts.isObjectLiteralExpression(initializer), `${relativePath} messages must be an object literal`)
  assert.equal(
    initializer.properties.filter(ts.isSpreadAssignment).length,
    0,
    `${relativePath} must not fill missing translations through an object spread`,
  )
  assert.equal(
    initializer.properties.filter(ts.isPropertyAssignment).length,
    runtimeKeys.length,
    `${relativePath} must explicitly define every runtime message`,
  )
}
for (const key of runtimeKeys) {
  assert.doesNotMatch(runtimeEnglishMessages[key], cjk, 'English runtime message contains Chinese text: ' + key)
}
for (const [locale, messages] of runtimeCatalogs) {
  assert.deepEqual(Object.keys(messages).sort(), runtimeKeys, locale + ' runtime catalog keys must match the default catalog')
  assertProtocolFields(messages['ai.prompt.generation'], generationProtocolFields, `${locale} runtime generation prompt`)
  assertProtocolFields(
    messages['ai.prompt.generationContract'],
    ['anchor', 'bookmarks', 'children', 'icon', 'label', 'lineNumber'],
    `${locale} runtime generation contract`,
  )
  assertProtocolFields(messages['ai.prompt.optimization'], optimizationProtocolFields, `${locale} runtime optimization prompt`)
  assertProtocolFields(
    messages['ai.prompt.optimizationContract'],
    [...optimizationProtocolFields, 'canAssignIcon'],
    `${locale} runtime optimization contract`,
  )
  if (cjkFreeLocales.has(locale)) {
    for (const key of runtimeKeys) {
      assert.doesNotMatch(messages[key], cjk, `${locale} runtime message contains Chinese text: ${key}`)
    }
  }
  if (!['zh-cn', 'en'].includes(locale)) {
    assert.notDeepEqual(messages, runtimeEnglishMessages, `${locale} runtime catalog must not duplicate English`)
    assertNoKnownMechanicalTranslationArtifacts(locale, messages, 'runtime catalog')
    assert.match(
      Object.values(messages).join('\n'),
      targetLocalePatterns[locale],
      `${locale} runtime catalog does not contain characteristic target-language text`,
    )
    for (const key of runtimeKeys) {
      if (messages[key] !== runtimeEnglishMessages[key]) continue
      assert.ok(
        languageNeutralRuntimeKeys.has(key),
        `${locale} runtime message still duplicates untranslated English: ${key}`,
      )
    }
  }
  for (const key of runtimeKeys) {
    assert.deepEqual(
      placeholders(messages[key]),
      placeholders(runtimeChineseMessages[key]),
      'Placeholder mismatch: ' + locale + ' -> ' + key,
    )
    if (!['zh-cn', 'en'].includes(locale)) {
      assert.deepEqual(
        technicalTokens(messages[key]),
        technicalTokens(runtimeEnglishMessages[key]),
        `Runtime technical-token mismatch: ${locale} -> ${key}`,
      )
      assert.doesNotMatch(messages[key], /ZXQ\d+QXZ|CBSEG\d+|CBPROTECT\w*/u, `${locale} runtime message contains a translation marker: ${key}`)
    }
  }
}
localization.initializeLocalization('zh-Hans')
assert.equal(localization.currentLanguage(), 'zh-cn')
assert.equal(localization.currentFormattingLocale(), 'zh-CN')
assert.equal(statistics.formatBookmarkLevelSummary({ total: 2, levelCounts: [1, 1] }), '共 2 个书签：一级 1 个、二级 1 个')
localization.initializeLocalization('en-GB')
assert.equal(localization.currentLanguage(), 'en')
assert.equal(localization.currentFormattingLocale(), 'en-US')
assert.equal(statistics.formatBookmarkLevelSummary({ total: 2, levelCounts: [1, 1] }), '2 bookmarks: Level 1: 1, Level 2: 1')

const allowedChineseDataFiles = new Set([
	...runtimeCatalogSourcePaths,
  'src/util/AIIconCatalog.ts',
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
const referencedRuntimeKeys = new Set()
const typedDynamicKeyModules = new Set([
  'src/i18n/Localization.ts',
  'src/util/BookmarkStatistics.ts',
  'src/util/UndoActions.ts',
])
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
      if (node.arguments.length < 1 || node.arguments.length > 2) {
        violations.push(`${relativePath}:${lineOf(node)} localize() must receive a key and optional values object`)
      }
      const keyArgument = node.arguments[0]
      if ((!keyArgument || !ts.isStringLiteral(keyArgument) || !(keyArgument.text in runtimeChineseMessages))
        && !typedDynamicKeyModules.has(relativePath)) {
        violations.push(`${relativePath}:${lineOf(node)} localize() must use a static catalog key`)
      } else if (keyArgument && ts.isStringLiteral(keyArgument)) referencedRuntimeKeys.add(keyArgument.text)
      if (node.arguments[1] && !ts.isObjectLiteralExpression(node.arguments[1])
        && relativePath !== 'src/i18n/Localization.ts') {
        violations.push(`${relativePath}:${lineOf(node.arguments[1])} localize() values must be an object literal`)
      }
      if (isModuleInitialization(node)) {
        violations.push(`${relativePath}:${lineOf(node)} localize() must not run during module initialization`)
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'UserCancelledError') {
      const keyArgument = node.arguments?.[0]
      if (!keyArgument || !ts.isStringLiteral(keyArgument) || !(keyArgument.text in runtimeChineseMessages)) {
        violations.push(`${relativePath}:${lineOf(node)} UserCancelledError must use a static catalog key`)
      } else referencedRuntimeKeys.add(keyArgument.text)
      if ((node.arguments?.length ?? 0) > 2) {
        violations.push(`${relativePath}:${lineOf(node)} UserCancelledError accepts only a key and optional values object`)
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
    if (stringNode && !runtimeCatalogSourcePaths.has(relativePath) && runtimeKeys.includes(node.text)) {
      referencedRuntimeKeys.add(node.text)
    }
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
assert.deepEqual(
  runtimeKeys.filter(key => !referencedRuntimeKeys.has(key)),
  [],
  'Every runtime catalog key must be referenced outside the catalogs',
)
assert.match(runtimeChineseMessages['ai.prompt.generation'], /lineNumber/)
assert.match(runtimeChineseMessages['ai.prompt.generationContract'], /icon/)
assert.doesNotMatch(runtimeEnglishMessages['ai.prompt.generationContract'], cjk)
assert.doesNotMatch(read('src/util/UndoActions.ts'), /_EN\b|currentLanguage\(/)
assert.doesNotMatch(read('src/util/AIIconCatalog.ts'), /_EN\b|AI_ICON_SELECTION_PROMPT/)

const documentPairs = [
  ['CHANGELOG.md', 'docs/CHANGELOG.en.md'],
  ['docs/release/RELEASING.md', 'docs/release/RELEASING.en.md'],
  ['docs/release/CHANGELOG_TEMPLATE.md', 'docs/release/CHANGELOG_TEMPLATE.en.md'],
  ['.github/CONTRIBUTING.md', '.github/CONTRIBUTING.en.md'],
  ['.github/SECURITY.md', '.github/SECURITY.en.md'],
  ['.github/SUPPORT.md', '.github/SUPPORT.en.md'],
  ['.github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.en.md'],
]
assert.deepEqual(Object.keys(README_DOCUMENT_BY_LANGUAGE), supportedLocales)
for (const [locale, documentPath] of Object.entries(README_DOCUMENT_BY_LANGUAGE)) {
  const content = read(documentPath)
  assert.ok(fs.statSync(path.join(root, documentPath)).isFile(), `${documentPath} must exist`)
  assert.ok(Buffer.byteLength(content, 'utf8') >= 8_000, `${documentPath} is too short to be a complete localized guide`)
  assert.match(content, /CodeBookmark/u, `${documentPath} must identify the product`)
  for (const requiredTopic of [
    'globalStoragePath', 'Ctrl+B', '_workspace_layout.json', 'TODO', 'FIXME', 'BUG',
    'APIKey', '.codebookmark', 'test:integration', 'CycloneDX', 'SHA256SUMS',
  ]) {
    assert.ok(content.includes(requiredTopic), `${documentPath} must document ${requiredTopic}`)
  }
  assert.doesNotMatch(content, /\.codebookmark\.json/u, `${documentPath} must not document the removed JSON import format`)
  assert.match(content, new RegExp(`<strong>${({
    'zh-cn': '简体中文', 'zh-hk': '繁體中文（香港）', 'zh-tw': '繁體中文（台灣）', en: 'English',
    ja: '日本語', vi: 'Tiếng Việt', ko: '한국어', es: 'Español', fr: 'Français', pt: 'Português',
    ru: 'Русский', de: 'Deutsch', it: 'Italiano',
  })[locale].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</strong>`), `${documentPath} must mark its active language`)
  for (const targetDocument of README_DOCUMENTS) {
    if (targetDocument === documentPath) continue
    const targetUrl = targetDocument === 'README.md' ? 'README.md' : targetDocument
    assert.match(content, new RegExp(targetUrl.replaceAll('.', '\\.')), `${documentPath} must link to ${targetDocument}`)
  }
}
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
const englishVersions = [...read('docs/CHANGELOG.en.md').matchAll(/^## 🎉 Version (\S+) - \d{4}-\d{2}-\d{2}$/gm)].map(match => match[1])
assert.deepEqual(englishVersions, chineseVersions, 'Chinese and English changelogs must cover the same versions')
assert.match(read('docs/README.en.md'), /^# User Guide$/m)
assert.match(read('docs/README.en.md'), /^# Developer Guide$/m)
assert.match(read('docs/README.en.md'), /Stable-key runtime language catalogs/)
assert.match(read('docs/README.en.md'), /localize\('stable\.key', \{ namedValue \}\)/)
assert.match(read('src/commands/bookmarkCommands.ts'), /readmeDocumentForLanguage\(currentLanguage\(\)\)/)
assert.match(read('src/commands/bookmarkCommands.ts'), /documentPath\.split\('\/'\)/)
assert.match(read('scripts/integration/run-integration-tests.js'), /const fallbackTestLocale = 'tr'/)
assert.match(
  read('scripts/integration/run-integration-tests.js'),
  /runLocale\(root, vscodeExecutablePath, fallbackTestLocale, downloadedVSCodeVersion, pendingTemporaryDirectories\)/,
)
assert.match(read('tests/integration/suite/index.js'), /manifestCatalogLocale = supportedLocales\.includes\(expectedLocale\) \? expectedLocale : 'en'/)

localization.initializeLocalization('zh-cn')
console.log('Complete stable-key localization contract verified.')
