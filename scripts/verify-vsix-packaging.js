/**
 * 验证 VSIX 打包只能在远端 runner 临时目录输出。
 * 覆盖本地执行、仓库内路径、runner 临时目录外路径和符号链接伪装，防止发布产物留在本机或仓库中。
 */
const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  parseOutputArgument,
  resolveVsixInvocation,
} = require('./release/package-vsix')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-vsix-output-'))
const repoRoot = path.join(sandbox, 'CodeBookmark')
const runnerTemp = path.join(sandbox, 'runner-temp')
fs.mkdirSync(repoRoot)
fs.mkdirSync(runnerTemp)

try {
  assert.throws(() => resolveVsixInvocation(repoRoot, [], { runnerTemp }), /explicit --out/)

  const customPath = path.join(runnerTemp, 'release', 'candidate.vsix')
  const customInvocation = resolveVsixInvocation(repoRoot, ['--out', customPath, '--pre-release'], { runnerTemp })
  assert.equal(customInvocation.outputPath, customPath)
  assert.deepEqual(customInvocation.args, ['--out', customPath, '--pre-release'])

  const equalsInvocation = resolveVsixInvocation(repoRoot, [`--out=${customPath}`], { runnerTemp })
  assert.deepEqual(equalsInvocation.args, [`--out=${customPath}`])
  assert.deepEqual(parseOutputArgument(['--out', customPath]), { index: 0, valueIndex: 1, value: customPath })

  assert.throws(
    () => resolveVsixInvocation(repoRoot, ['--out', path.join(repoRoot, 'candidate.vsix')], { runnerTemp }),
    /outside the repository/,
  )
  assert.throws(
    () => resolveVsixInvocation(repoRoot, ['--out', path.join(repoRoot, 'nested', 'candidate.vsix')], { runnerTemp }),
    /outside the repository/,
  )
  assert.throws(
    () => resolveVsixInvocation(repoRoot, ['--out', path.join(sandbox, 'outside-runner-temp.vsix')], { runnerTemp }),
    /runner temp directory/,
  )
  assert.throws(() => resolveVsixInvocation(repoRoot, ['--out'], { runnerTemp }), /requires/)
  assert.throws(() => resolveVsixInvocation(repoRoot, ['--out', customPath, `--out=${customPath}`], { runnerTemp }), /only/)
  assert.throws(() => resolveVsixInvocation(repoRoot, ['--out', `${customPath}.zip`], { runnerTemp }), /\.vsix extension/)

  const link = path.join(runnerTemp, 'repository-link')
  try {
    fs.symlinkSync(repoRoot, link, process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(
      () => resolveVsixInvocation(repoRoot, ['--out', path.join(link, 'candidate.vsix')], { runnerTemp }),
      /resolves inside the repository/,
    )
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error
  }

  const localRun = childProcess.spawnSync(
    process.execPath,
    [path.join(__dirname, 'release', 'package-vsix.js'), '--out', customPath],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: 'false', RUNNER_TEMP: runnerTemp },
    },
  )
  assert.notEqual(localRun.status, 0)
  assert.match(`${localRun.stdout}${localRun.stderr}`, /GitHub Actions/)

  const missingRunnerTempEnvironment = { ...process.env, GITHUB_ACTIONS: 'true' }
  delete missingRunnerTempEnvironment.RUNNER_TEMP
  const missingRunnerTempRun = childProcess.spawnSync(
    process.execPath,
    [path.join(__dirname, 'release', 'package-vsix.js'), '--out', customPath],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      env: missingRunnerTempEnvironment,
    },
  )
  assert.notEqual(missingRunnerTempRun.status, 0)
  assert.match(`${missingRunnerTempRun.stdout}${missingRunnerTempRun.stderr}`, /RUNNER_TEMP/)
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true })
}

console.log('VSIX output boundary contract verified.')
