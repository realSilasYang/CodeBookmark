/**
 * 优先复用本机 VS Code，创建隔离的用户目录和测试工作区后启动真实 Extension Host。
 * 十三种受支持显示语言和未知非中文回退场景分开执行；宿主自身的已知诊断会被分类，项目相关错误仍会使测试失败。
 */
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const { spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const { Writable } = require('node:stream')
const { pathToFileURL } = require('node:url')
const { downloadAndUnzipVSCode, runTests, runVSCodeCommand } = require('@vscode/test-electron')

const supportedTestLocales = Object.freeze([
  'zh-cn', 'zh-hk', 'zh-tw', 'en',
  'ja', 'vi', 'ko', 'es', 'fr', 'pt', 'ru', 'de', 'it',
])
const fallbackTestLocale = 'tr'

const knownExternalDiagnosticPatterns = [
  /^(?:Warning: 'cached-data' is not in the list of known options, but still passed to Electron\/Chromium\.|警告: "cached-data"不在已知选项列表中，但仍传递给 Electron\/Chromium。)\r?\n?/gmu,
  /^\[main [^\]]+\] Error: Error mutex already exists(?:\r?\n\s+at [^\r\n]*)*(?:\r?\n\))?\r?\n?/gmu,
  /^\[vscode\.mermaid-markdown-features\]: Extension 'vscode\.mermaid-markdown-features' CANNOT use 'legacyToolReferenceFullNames' without the 'chatParticipantPrivate' API proposal enabled\r?\n?/gmu,
  /^SettingsEditor2: Settings not included in settingsLayout\.ts:.*\r?\n?/gmu,
  /^(?:\[main [^\]]+\] \[AgentHost:stderr\] )?\(node:\d+\) \[DEP0169\] DeprecationWarning: `url\.parse\(\)`[^\r\n]*(?:\r?\n\(Use `Code --trace-deprecation \.\.\.` to show where the warning was created\))?\r?\n?/gmu,
  /^Unknown channel: agentHostClientProxy\r?\n?/gmu,
  /^\[\d+:\d+\/\d+\.\d+:ERROR:gpu[\\/]ipc[\\/]client[\\/]command_buffer_proxy_impl\.cc:\d+\] GPU state invalid after WaitForGetOffsetInRange\.\r?\n?/gmu,
]

function outputSink(chunks) {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })
}

function stripKnownExternalDiagnostics(output) {
  let remaining = output
  let count = 0
  for (const pattern of knownExternalDiagnosticPatterns) {
    remaining = remaining.replace(pattern, () => {
      count++
      return ''
    })
  }
  return { remaining, count }
}

function assertNoUnexpectedExtensionHostDiagnostics(stdout, stderr) {
  const cleanedStdout = stripKnownExternalDiagnostics(stdout)
  const cleanedStderr = stripKnownExternalDiagnostics(stderr)
  const unexpectedStderr = cleanedStderr.remaining.trim()
  const suspiciousStdout = cleanedStdout.remaining.split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => /\b(?:warning|error|cannot|failed|failure|exception|deprecation)\b|警告|错误|失败|异常/iu.test(line))
  if (unexpectedStderr || suspiciousStdout.length > 0) {
    const details = [unexpectedStderr, ...suspiciousStdout].filter(Boolean).join('\n')
    throw new Error(`Unexpected Extension Host diagnostics:\n${details}`)
  }
  return cleanedStdout.count + cleanedStderr.count
}

function isKnownExternalProjectLogDiagnostic(entry, normalizedRoot) {
  const normalizedEntry = entry.replaceAll('\\', '/').toLowerCase()
  const belongsToDownloadedHost = normalizedEntry.includes(`${normalizedRoot}/.vscode-test/`)
    && !normalizedEntry.includes(`${normalizedRoot}/out/extension.js`)
    && !normalizedEntry.includes('realsilasyang.codebookmark')
  if (!belongsToDownloadedHost) return false
  const canceledProxyResolution = /\[error\]\s+proxyresolver#resolveproxy undefined canceled: canceled\b/iu.test(entry)
    && normalizedEntry.includes('/resources/app/out/vs/workbench/api/node/extensionhostprocess.js')
  const builtInJsonNavigatorMigration = /\[error\]\s+pendingmigrationerror: navigator is now a global in nodejs\b/iu.test(entry)
    && normalizedEntry.includes('/resources/app/extensions/json-language-features/')
  return canceledProxyResolution || builtInJsonNavigatorMigration
}

function findProjectDiagnosticsInLog(logContent, root, logFile = '<log>') {
  const normalizedRoot = path.resolve(root).replaceAll('\\', '/').toLowerCase()
  const diagnostics = []
  const lines = logContent.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index++) {
    if (!/^\d{4}-\d{2}-\d{2}[^\r\n]*\[(?:error|warning)\]/iu.test(lines[index])) continue
    const entryLines = [lines[index]]
    while (index + 1 < lines.length && !/^\d{4}-\d{2}-\d{2}/u.test(lines[index + 1])) {
      entryLines.push(lines[++index])
    }
    const entry = entryLines.join('\n')
    const normalizedEntry = entry.replaceAll('\\', '/').toLowerCase()
    if (isKnownExternalProjectLogDiagnostic(entry, normalizedRoot)) continue
    if (normalizedEntry.includes(normalizedRoot)
      || normalizedEntry.includes('realsilasyang.codebookmark')) {
      diagnostics.push(`${logFile}: ${entry.trim()}`)
    }
  }
  if (/codebookmark/i.test(path.basename(logFile))) {
    for (const line of logContent.split(/\r?\n/u)) {
      if (/\[(?:error|错误)\]/iu.test(line)) diagnostics.push(`${logFile}: ${line.trim()}`)
    }
  }
  return diagnostics
}

async function collectLogFiles(directory) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectLogFiles(absolutePath))
    else if (entry.isFile() && entry.name.endsWith('.log')) files.push(absolutePath)
  }
  return files
}

async function assertNoProjectLogDiagnostics(tempRoot, root) {
  const logsRoot = path.join(tempRoot, 'user-data', 'logs')
  if (!fsSync.existsSync(logsRoot)) return
  const diagnostics = []
  for (const logFile of await collectLogFiles(logsRoot)) {
    const content = await fs.readFile(logFile, 'utf8')
    diagnostics.push(...findProjectDiagnosticsInLog(content, root, path.relative(tempRoot, logFile)))
  }
  if (diagnostics.length > 0) {
    throw new Error(`CodeBookmark diagnostics were written to Extension Host logs:\n${diagnostics.join('\n')}`)
  }
}

function existingFile(candidate) {
  if (!candidate) return undefined
  try {
    return fsSync.statSync(candidate).isFile() ? path.resolve(candidate) : undefined
  } catch {
    return undefined
  }
}

function commandPaths(command) {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which'
  const result = spawnSync(locator, [command], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0 || !result.stdout) return []
  return result.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
}

function executableFromCommandPath(commandPath) {
  if (process.platform !== 'win32') return existingFile(commandPath)
  const basename = path.basename(commandPath).toLowerCase()
  if (basename === 'code' || basename === 'code.cmd') {
    return existingFile(path.resolve(path.dirname(commandPath), '..', 'Code.exe'))
  }
  if (basename === 'code-insiders' || basename === 'code-insiders.cmd') {
    return existingFile(path.resolve(path.dirname(commandPath), '..', 'Code - Insiders.exe'))
  }
  return existingFile(commandPath)
}

function findInstalledVSCodeExecutable() {
  for (const command of ['code', 'code-insiders']) {
    for (const commandPath of commandPaths(command)) {
      const executable = executableFromCommandPath(commandPath)
      if (executable) return executable
    }
  }

  const candidates = process.platform === 'win32'
    ? [
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'),
        process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe'),
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
          path.join(os.homedir(), 'Applications', 'Visual Studio Code.app', 'Contents', 'MacOS', 'Electron'),
        ]
      : ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code', '/usr/share/code/code']
  return candidates.map(existingFile).find(Boolean)
}

function findInstalledLanguagePacksFile() {
  const candidates = process.platform === 'win32'
    ? [
        process.env.APPDATA && path.join(process.env.APPDATA, 'Code', 'languagepacks.json'),
        process.env.APPDATA && path.join(process.env.APPDATA, 'Code - Insiders', 'languagepacks.json'),
      ]
    : process.platform === 'darwin'
      ? [
          path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'languagepacks.json'),
          path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'languagepacks.json'),
        ]
      : [
          path.join(os.homedir(), '.config', 'Code', 'languagepacks.json'),
          path.join(os.homedir(), '.config', 'Code - Insiders', 'languagepacks.json'),
        ]
  return candidates.map(existingFile).find(Boolean)
}

function createLanguagePacksConfiguration(manifest, extensionPath) {
  const extensionId = `${manifest.publisher}.${manifest.name}`.toLowerCase()
  if (extensionId !== 'ms-ceintl.vscode-language-pack-zh-hans') {
    throw new Error(`不是受支持的简体中文语言包：${extensionId}`)
  }
  const localization = manifest.contributes?.localizations?.find(item => item.languageId === 'zh-cn')
  if (!localization?.translations?.length) {
    throw new Error('简体中文语言包清单缺少 contributes.localizations 翻译映射。')
  }
  const translations = Object.fromEntries(localization.translations.map(translation => [
    translation.id,
    path.resolve(extensionPath, translation.path),
  ]))
  if (!translations.vscode) throw new Error('简体中文语言包缺少 VS Code 核心翻译。')
  const hash = crypto.createHash('md5')
    .update(`${extensionId}@${manifest.version}`)
    .digest('hex')
  return {
    'zh-cn': {
      hash,
      extensions: [{
        extensionIdentifier: { id: extensionId },
        version: manifest.version,
      }],
      translations,
      label: localization.localizedLanguageName || localization.languageName || '简体中文',
    },
  }
}

async function writeDownloadedLanguagePacksFile(extensionsPath, userDataPath) {
  for (const entry of await fs.readdir(extensionsPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const extensionPath = path.join(extensionsPath, entry.name)
    let manifest
    try {
      manifest = JSON.parse(await fs.readFile(path.join(extensionPath, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    if (`${manifest.publisher}.${manifest.name}`.toLowerCase()
      !== 'ms-ceintl.vscode-language-pack-zh-hans') continue
    const configuration = createLanguagePacksConfiguration(manifest, extensionPath)
    for (const translationPath of Object.values(configuration['zh-cn'].translations)) {
      if (!existingFile(translationPath)) {
        throw new Error(`简体中文语言包翻译文件不存在：${translationPath}`)
      }
    }
    await fs.writeFile(
      path.join(userDataPath, 'languagepacks.json'),
      JSON.stringify(configuration),
      'utf8',
    )
    return
  }
  throw new Error('远端集成测试未找到已安装的 VS Code 简体中文语言包。')
}

async function prepareDownloadedLanguagePack(version, extensionsPath, userDataPath) {
  const inheritedNoDeprecation = process.noDeprecation
  process.noDeprecation = true
  try {
    await runVSCodeCommand([
      '--install-extension',
      'MS-CEINTL.vscode-language-pack-zh-hans',
      '--force',
      `--user-data-dir=${userDataPath}`,
      `--extensions-dir=${extensionsPath}`,
    ], { version })
  } finally {
    process.noDeprecation = inheritedNoDeprecation
  }
  await writeDownloadedLanguagePacksFile(extensionsPath, userDataPath)
}

async function aliasInstalledLanguagePack(sourcePath, userDataPath, targetLocale) {
  const sourceConfiguration = JSON.parse(await fs.readFile(sourcePath, 'utf8'))
  const source = sourceConfiguration['zh-cn'] ?? Object.values(sourceConfiguration)[0]
  if (!source?.translations?.vscode || !existingFile(source.translations.vscode)) {
    throw new Error('无法为非中文清单回退测试找到可复用的 VS Code 核心语言包。')
  }
  const configuration = {
    [targetLocale]: {
      ...source,
      hash: crypto.createHash('md5').update(targetLocale + ':' + source.hash).digest('hex'),
      label: targetLocale + ' manifest fallback test',
    },
  }
  await fs.writeFile(
    path.join(userDataPath, 'languagepacks.json'),
    JSON.stringify(configuration),
    'utf8',
  )
}

async function removeTemporaryDirectory(tempRoot, options = {}) {
  // VS Code 退出后，Windows 偶尔还会短暂持有日志或缓存文件句柄。先给宿主
  // 留出释放时间，再做总时长有上限的同步重试，避免测试成功后卡在清理阶段。
  const initialDelayMs = options.initialDelayMs ?? 500
  const attempts = options.attempts ?? 5
  const retryDelayMs = options.retryDelayMs ?? 200
  if (initialDelayMs > 0) await new Promise(resolve => setTimeout(resolve, initialDelayMs))
  let lastError
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      fsSync.rmSync(tempRoot, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 100,
      })
      return
    } catch (error) {
      lastError = error
      if (process.platform !== 'win32' || !fsSync.existsSync(tempRoot)) throw error
      if (attempt < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)))
      }
    }
  }

  throw lastError
}

async function runLocale(
  root,
  vscodeExecutablePath,
  locale,
  downloadedVSCodeVersion,
  pendingTemporaryDirectories,
) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `codebookmark-integration-${locale}-`))
  const fixturePath = path.join(tempRoot, 'workspace')
  const bookmarkStoragePath = path.join(tempRoot, 'bookmark-storage')
  const userDataPath = path.join(tempRoot, 'user-data')
  const extensionsPath = path.join(tempRoot, 'extensions')
  const fixtureUri = pathToFileURL(fixturePath).href
  await fs.mkdir(fixturePath, { recursive: true })
  await fs.mkdir(bookmarkStoragePath, { recursive: true })
  await fs.mkdir(path.join(userDataPath, 'User'), { recursive: true })
  // 内置 Git 扩展会为 askpass 创建仅向其沙箱 SID 授权的目录，测试进程随后
  // 无权删除整个隔离用户目录。测试不依赖 Git，预先关闭它可保持清理权限完整。
  await fs.writeFile(path.join(userDataPath, 'User', 'settings.json'), JSON.stringify({
    'git.enabled': false,
    'codebookmark.globalStoragePath': bookmarkStoragePath,
  }, null, 2), 'utf8')
  const languagePacksFile = findInstalledLanguagePacksFile()
  if (downloadedVSCodeVersion && locale !== 'en') {
    await fs.mkdir(extensionsPath, { recursive: true })
    console.log(`正在为远端 ${locale} 集成测试准备可复用的 VS Code 语言包。`)
    await prepareDownloadedLanguagePack(downloadedVSCodeVersion, extensionsPath, userDataPath)
    if (locale !== 'zh-cn') {
      await aliasInstalledLanguagePack(
        path.join(userDataPath, 'languagepacks.json'),
        userDataPath,
        locale,
      )
    }
  } else if (locale === 'zh-cn' && languagePacksFile) {
    await fs.copyFile(languagePacksFile, path.join(userDataPath, 'languagepacks.json'))
  } else if (locale !== 'zh-cn' && locale !== 'en' && languagePacksFile) {
    await aliasInstalledLanguagePack(languagePacksFile, userDataPath, locale)
  } else if (locale !== 'zh-cn' && locale !== 'en') {
    throw new Error(`${locale} 清单测试需要本机至少安装一个 VS Code 语言包。`)
  }
  await fs.copyFile(
    path.join(root, 'tests', 'integration', 'fixture', 'sample.ts'),
    path.join(fixturePath, 'sample.ts'),
  )
  // 当前进程可能继承 ELECTRON_RUN_AS_NODE。把它原样交给 VS Code 后，Electron 会
  // 把测试工作区路径当成 Node.js 脚本入口，因此启动宿主前必须从子进程环境中移除。
  const inheritedElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE
  const expectedRuntimeLanguage = supportedTestLocales.includes(locale) ? locale : 'en'
  delete process.env.ELECTRON_RUN_AS_NODE
  try {
    console.log(`Running Extension Host integration tests with locale ${locale}`)
    const stdoutChunks = []
    const stderrChunks = []
    try {
      await runTests({
        vscodeExecutablePath,
        reuseMachineInstall: true,
        extensionDevelopmentPath: root,
        extensionTestsPath: path.join(root, 'tests', 'integration', 'suite', 'index.js'),
        extensionTestsEnv: {
          CODEBOOKMARK_INTEGRATION_TEST: '1',
          CODEBOOKMARK_TEST_LOCALE: locale,
          CODEBOOKMARK_TEST_RUNTIME_LANGUAGE: expectedRuntimeLanguage,
          CODEBOOKMARK_TEST_STORAGE_ROOT: bookmarkStoragePath,
          VSCODE_NLS_CONFIG: JSON.stringify({
            userLocale: locale,
            osLocale: locale,
            resolvedLanguage: locale,
          }),
        },
        stdout: outputSink(stdoutChunks),
        stderr: outputSink(stderrChunks),
        launchArgs: [
          `--user-data-dir=${userDataPath}`,
          `--extensions-dir=${extensionsPath}`,
          '--disable-extensions',
          '--disable-extension=vscode.git',
          '--disable-extension=vscode.git-base',
          '--disable-workspace-trust',
          '--skip-release-notes',
          '--skip-welcome',
          `--locale=${locale}`,
          `--folder-uri=${fixtureUri}`,
        ],
      })
    } catch (error) {
      process.stdout.write(Buffer.concat(stdoutChunks))
      process.stderr.write(Buffer.concat(stderrChunks))
      throw error
    }
    const stdout = Buffer.concat(stdoutChunks).toString('utf8')
    const stderr = Buffer.concat(stderrChunks).toString('utf8')
    const externalDiagnosticCount = assertNoUnexpectedExtensionHostDiagnostics(stdout, stderr)
    await assertNoProjectLogDiagnostics(tempRoot, root)
    console.log(`Extension Host integration verified for ${locale}; classified ${externalDiagnosticCount} external host diagnostics.`)
  } finally {
    if (inheritedElectronRunAsNode === undefined) delete process.env.ELECTRON_RUN_AS_NODE
    else process.env.ELECTRON_RUN_AS_NODE = inheritedElectronRunAsNode
    try {
      await removeTemporaryDirectory(tempRoot)
    } catch (error) {
      pendingTemporaryDirectories.add(tempRoot)
      console.warn(`Unable to remove temporary integration directory ${tempRoot}: ${error.message}`)
    }
  }
}

async function main() {
  const root = path.resolve(__dirname, '../..')
  const executablePrefix = '--vscode-executable='
  const localePrefix = '--locale='
  const executableArgument = process.argv.find(argument => argument.startsWith(executablePrefix))
  const localeArgument = process.argv.find(argument => argument.startsWith(localePrefix))
  const requestedLocale = localeArgument?.slice(localePrefix.length).toLowerCase()
  if (requestedLocale && ![...supportedTestLocales, fallbackTestLocale].includes(requestedLocale)) {
    throw new Error(`不支持的集成测试语言：${requestedLocale}`)
  }
  const configuredExecutablePath = executableArgument?.slice(executablePrefix.length)
    || process.env.CODEBOOKMARK_VSCODE_EXECUTABLE_PATH?.trim()
  let vscodeExecutablePath = configuredExecutablePath
    ? existingFile(path.resolve(configuredExecutablePath))
    : findInstalledVSCodeExecutable()
  let downloadedVSCodeVersion
  if (configuredExecutablePath && !vscodeExecutablePath) {
    throw new Error(`指定的 VS Code 程序不存在或不是文件：${path.resolve(configuredExecutablePath)}`)
  }
  if (!vscodeExecutablePath && process.env.CODEBOOKMARK_ALLOW_VSCODE_DOWNLOAD === 'true') {
    const version = process.env.CODEBOOKMARK_VSCODE_TEST_VERSION?.trim() || 'stable'
    console.log(`未找到已安装的 VS Code；远端测试已显式允许下载 VS Code ${version}。`)
    vscodeExecutablePath = await downloadAndUnzipVSCode(version)
    downloadedVSCodeVersion = version
  }
  if (!vscodeExecutablePath) {
    throw new Error('未找到本机已安装的 VS Code。请安装 VS Code，或通过 CODEBOOKMARK_VSCODE_EXECUTABLE_PATH 指定 Code 可执行文件。')
  }
  console.log(`Using VS Code: ${vscodeExecutablePath}`)
  const pendingTemporaryDirectories = new Set()
  const locales = requestedLocale ? [requestedLocale] : supportedTestLocales
  for (const locale of locales) {
    await runLocale(root, vscodeExecutablePath, locale, downloadedVSCodeVersion, pendingTemporaryDirectories)
  }
  if (!requestedLocale) {
    await runLocale(root, vscodeExecutablePath, fallbackTestLocale, downloadedVSCodeVersion, pendingTemporaryDirectories)
  }
  if (pendingTemporaryDirectories.size > 0) {
    // 所有语言宿主退出后再统一等待一次；此前仍被最后几个 Electron 子进程
    // 占用的目录通常会在这一阶段释放。并行清理避免失败目录线性拖长测试。
    await new Promise(resolve => setTimeout(resolve, 2_000))
    await Promise.all([...pendingTemporaryDirectories].map(async tempRoot => {
      try {
        await removeTemporaryDirectory(tempRoot, { initialDelayMs: 0, attempts: 10, retryDelayMs: 250 })
      } catch (error) {
        console.warn(`Unable to remove temporary integration directory after final retry ${tempRoot}: ${error.message}`)
      }
    }))
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = {
  assertNoProjectLogDiagnostics,
  assertNoUnexpectedExtensionHostDiagnostics,
  createLanguagePacksConfiguration,
  findProjectDiagnosticsInLog,
  findInstalledVSCodeExecutable,
  outputSink,
  stripKnownExternalDiagnostics,
}
