/**
 * 复用本机 VS Code，以隔离用户数据和书签目录重复测量真实工作区自动标记扫描。
 * 每次运行都启动全新的 Extension Host；首轮反映较冷缓存，其余轮次用于统计热缓存尾延迟。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { runTests } = require('@vscode/test-electron')
const {
  assertNoProjectLogDiagnostics,
  assertNoUnexpectedExtensionHostDiagnostics,
  findInstalledVSCodeExecutable,
  outputSink,
} = require('../integration/run-integration-tests')

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

async function runOnce(root, vscodeExecutablePath, runNumber) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), `codebookmark-marker-perf-${runNumber}-`))
  const userDataPath = path.join(tempRoot, 'user-data')
  const extensionsPath = path.join(tempRoot, 'extensions')
  const storagePath = path.join(tempRoot, 'bookmarks')
  const resultPath = path.join(tempRoot, 'result.json')
  await fs.mkdir(path.join(userDataPath, 'User'), { recursive: true })
  await fs.mkdir(extensionsPath, { recursive: true })
  await fs.writeFile(path.join(userDataPath, 'User', 'settings.json'), JSON.stringify({
    'git.enabled': false,
    'codebookmark.globalStoragePath': storagePath,
  }), 'utf8')
  try {
    const stdoutChunks = []
    const stderrChunks = []
    try {
      await runTests({
        vscodeExecutablePath,
        reuseMachineInstall: true,
        extensionDevelopmentPath: root,
        extensionTestsPath: path.join(root, 'tests', 'performance', 'suite', 'index.js'),
        extensionTestsEnv: {
          CODEBOOKMARK_INTEGRATION_TEST: '1',
          CODEBOOKMARK_PERF: '1',
          CODEBOOKMARK_PERF_RESULT_PATH: resultPath,
        },
        stdout: outputSink(stdoutChunks),
        stderr: outputSink(stderrChunks),
        launchArgs: [
          `--user-data-dir=${userDataPath}`,
          `--extensions-dir=${extensionsPath}`,
          '--disable-extensions',
          '--disable-workspace-trust',
          '--skip-release-notes',
          '--skip-welcome',
          `--folder-uri=${pathToFileURL(root).href}`,
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
    return {
      measurement: JSON.parse(await fs.readFile(resultPath, 'utf8')),
      externalDiagnosticCount,
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
}

async function main() {
  const root = path.resolve(__dirname, '../..')
  const runsArgument = process.argv.find(argument => argument.startsWith('--runs='))
  const runs = Number.parseInt(runsArgument?.slice('--runs='.length) ?? '5', 10)
  assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 20, 'Benchmark runs must be between 1 and 20')
  const vscodeExecutablePath = findInstalledVSCodeExecutable()
  assert.ok(vscodeExecutablePath, 'A locally installed VS Code is required')
  console.log(`Using VS Code: ${vscodeExecutablePath}`)

  const measurements = []
  let externalDiagnosticCount = 0
  for (let index = 0; index < runs; index++) {
    const result = await runOnce(root, vscodeExecutablePath, index + 1)
    const measurement = result.measurement
    externalDiagnosticCount += result.externalDiagnosticCount
    measurements.push(measurement)
    console.log(`Run ${index + 1}: ${measurement.durationMs.toFixed(1)} ms, files=${measurement.detail.files}, exactScans=${measurement.detail.exactScans}`)
  }
  const durations = measurements.map(measurement => measurement.durationMs)
  console.log(JSON.stringify({
    runs,
    coldMs: Number(durations[0].toFixed(1)),
    p50Ms: Number(percentile(durations, 0.5).toFixed(1)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(1)),
    classifiedExternalDiagnostics: externalDiagnosticCount,
    last: measurements.at(-1).detail,
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
