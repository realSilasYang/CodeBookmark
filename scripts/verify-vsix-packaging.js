/**
 * 在临时仓库模型中验证 VSIX 必须显式输出到仓库外，并覆盖仓库内部路径拒绝规则，避免发布命令再次绕过结构守卫。
 * 测试还使用目录连接模拟路径伪装，确认词法上位于仓库外的路径不能经连接落回仓库内部。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  parseOutputArgument,
  resolveVsixInvocation,
} = require('./release/package-vsix')

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-vsix-output-'))
const repoRoot = path.join(sandbox, 'CodeBookmark')
fs.mkdirSync(repoRoot)

try {
  assert.throws(() => resolveVsixInvocation(repoRoot, []), /must be explicit/)

  const customPath = path.join(sandbox, 'release', 'candidate.vsix')
  const customInvocation = resolveVsixInvocation(repoRoot, ['--out', customPath, '--pre-release'])
  assert.equal(customInvocation.outputPath, customPath)
  assert.deepEqual(customInvocation.args, ['--out', customPath, '--pre-release'])

  const equalsInvocation = resolveVsixInvocation(repoRoot, [`--out=${customPath}`])
  assert.deepEqual(equalsInvocation.args, [`--out=${customPath}`])
  assert.deepEqual(parseOutputArgument(['--out', customPath]), { index: 0, valueIndex: 1, value: customPath })

  assert.throws(
    () => resolveVsixInvocation(repoRoot, ['--out', path.join(repoRoot, 'candidate.vsix')]),
    /outside the repository/,
  )
  assert.throws(
    () => resolveVsixInvocation(repoRoot, ['--out', path.join(repoRoot, 'nested', 'candidate.vsix')]),
    /outside the repository/,
  )
  assert.throws(() => resolveVsixInvocation(repoRoot, ['--out']), /requires/)
  assert.throws(() => resolveVsixInvocation(repoRoot, ['--out', customPath, `--out=${customPath}`]), /only/)
  assert.throws(() => resolveVsixInvocation(repoRoot, ['--out', `${customPath}.zip`]), /\.vsix extension/)

  const link = path.join(sandbox, 'repository-link')
  try {
    fs.symlinkSync(repoRoot, link, process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(
      () => resolveVsixInvocation(repoRoot, ['--out', path.join(link, 'candidate.vsix')]),
      /resolves inside the repository/,
    )
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error
  }
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true })
}

console.log('VSIX output boundary contract verified.')
