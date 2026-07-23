const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const { spawnSync } = require('node:child_process')
const { Writable } = require('node:stream')
const { pathToFileURL } = require('node:url')
const { runTests } = require('@vscode/test-electron')

const knownExternalDiagnosticPatterns = [
  /^(?:Warning: 'cached-data' is not in the list of known options, but still passed to Electron\/Chromium\.|警告: "cached-data"不在已知选项列表中，但仍传递给 Electron\/Chromium。)\r?\n?/gmu,
  /^\[main [^\]]+\] Error: Error mutex already exists(?:\r?\n\s+at [^\r\n]*)*(?:\r?\n\))?\r?\n?/gmu,
  /^\[vscode\.mermaid-markdown-features\]: Extension 'vscode\.mermaid-markdown-features' CANNOT use 'legacyToolReferenceFullNames' without the 'chatParticipantPrivate' API proposal enabled\r?\n?/gmu,
  /^SettingsEditor2: Settings not included in settingsLayout\.ts:.*\r?\n?/gmu,
  /^\(node:\d+\) \[DEP0169\] DeprecationWarning: `url\.parse\(\)`[^\r\n]*(?:\r?\n\(Use `Code --trace-deprecation \.\.\.` to show where the warning was created\))?\r?\n?/gmu,
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

function removeTemporaryDirectory(tempRoot) {
  const remove = () => fsSync.rmSync(tempRoot, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  })
  try {
    remove()
    return
  } catch (initialError) {
    if (process.platform !== 'win32' || !fsSync.existsSync(tempRoot)) throw initialError
  }

  const username = process.env.USERNAME?.trim()
  const principal = username
    ? `${process.env.USERDOMAIN?.trim() ? `${process.env.USERDOMAIN.trim()}\\` : ''}${username}`
    : undefined
  if (principal) {
    spawnSync('icacls.exe', [
      tempRoot,
      '/grant',
      `${principal}:(OI)(CI)F`,
      '/T',
      '/C',
      '/Q',
    ], { windowsHide: true, stdio: 'ignore' })
  }
  remove()
}

async function runLocale(root, vscodeExecutablePath, locale) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `codebookmark-integration-${locale}-`))
  const fixturePath = path.join(tempRoot, 'workspace')
  const userDataPath = path.join(tempRoot, 'user-data')
  const fixtureUri = pathToFileURL(fixturePath).href
  await fs.mkdir(fixturePath, { recursive: true })
  await fs.mkdir(path.join(userDataPath, 'User'), { recursive: true })
  const languagePacksFile = findInstalledLanguagePacksFile()
  if (locale === 'zh-cn' && languagePacksFile) {
    await fs.copyFile(languagePacksFile, path.join(userDataPath, 'languagepacks.json'))
  }
  await fs.copyFile(
    path.join(root, 'integration-tests', 'fixture', 'sample.ts'),
    path.join(fixturePath, 'sample.ts'),
  )
  // Commands launched from a VS Code extension host inherit this flag. Electron
  // would then treat the workspace argument as a Node.js entry module.
  const inheritedElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE
  const inheritedTestLocale = process.env.CODEBOOKMARK_TEST_LOCALE
  delete process.env.ELECTRON_RUN_AS_NODE
  process.env.CODEBOOKMARK_TEST_LOCALE = locale
  try {
    console.log(`Running Extension Host integration tests with locale ${locale}`)
    const stdoutChunks = []
    const stderrChunks = []
    try {
      await runTests({
        vscodeExecutablePath,
        reuseMachineInstall: true,
        extensionDevelopmentPath: root,
        extensionTestsPath: path.join(root, 'integration-tests', 'suite', 'index.js'),
        extensionTestsEnv: {
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
    if (inheritedTestLocale === undefined) delete process.env.CODEBOOKMARK_TEST_LOCALE
    else process.env.CODEBOOKMARK_TEST_LOCALE = inheritedTestLocale
    try {
      removeTemporaryDirectory(tempRoot)
    } catch (error) {
      console.warn(`Unable to remove temporary integration directory ${tempRoot}: ${error.message}`)
    }
  }
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const executablePrefix = '--vscode-executable='
  const localePrefix = '--locale='
  const executableArgument = process.argv.find(argument => argument.startsWith(executablePrefix))
  const localeArgument = process.argv.find(argument => argument.startsWith(localePrefix))
  const requestedLocale = localeArgument?.slice(localePrefix.length).toLowerCase()
  if (requestedLocale && requestedLocale !== 'zh-cn' && requestedLocale !== 'en') {
    throw new Error(`不支持的集成测试语言：${requestedLocale}`)
  }
  const configuredExecutablePath = executableArgument?.slice(executablePrefix.length)
    || process.env.CODEBOOKMARK_VSCODE_EXECUTABLE_PATH?.trim()
  const vscodeExecutablePath = configuredExecutablePath
    ? existingFile(path.resolve(configuredExecutablePath))
    : findInstalledVSCodeExecutable()
  if (configuredExecutablePath && !vscodeExecutablePath) {
    throw new Error(`指定的 VS Code 程序不存在或不是文件：${path.resolve(configuredExecutablePath)}`)
  }
  if (!vscodeExecutablePath) {
    throw new Error('未找到本机已安装的 VS Code。请安装 VS Code，或通过 CODEBOOKMARK_VSCODE_EXECUTABLE_PATH 指定 Code 可执行文件。')
  }
  console.log(`Using installed VS Code: ${vscodeExecutablePath}`)
  const locales = requestedLocale ? [requestedLocale] : ['zh-cn', 'en']
  for (const locale of locales) await runLocale(root, vscodeExecutablePath, locale)
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = {
  assertNoUnexpectedExtensionHostDiagnostics,
  findProjectDiagnosticsInLog,
  findInstalledVSCodeExecutable,
  stripKnownExternalDiagnostics,
}
