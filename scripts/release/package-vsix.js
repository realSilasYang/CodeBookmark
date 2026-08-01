/**
 * 验证远端专用的 VSIX 打包入口，并调用仓库锁定版本的 vsce。
 * 打包只能在 GitHub Actions 中写入 runner 临时目录，结束后会清理本地化清单和编译输出。
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { GENERATED_NLS_PATTERN } = require('../lib/manifest-language-catalogs')

function isSameOrDescendant(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function parseOutputArgument(args) {
  const matches = []
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--out') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error('--out requires a VSIX output path')
      }
      matches.push({ index, valueIndex: index + 1, value: args[index + 1] })
      index++
    } else if (argument.startsWith('--out=')) {
      const value = argument.slice('--out='.length)
      if (!value) throw new Error('--out requires a VSIX output path')
      matches.push({ index, valueIndex: index, value })
    }
  }
  if (matches.length > 1) throw new Error('VSIX output path may only be specified once')
  return matches[0]
}

function cleanTransientBuildOutputs(repoRoot) {
  fs.rmSync(path.join(repoRoot, 'out'), { recursive: true, force: true })
  for (const entry of fs.readdirSync(repoRoot, { withFileTypes: true })) {
    if (entry.isFile() && GENERATED_NLS_PATTERN.test(entry.name)) {
      fs.rmSync(path.join(repoRoot, entry.name), { force: true })
    }
  }
}

function resolveVsixInvocation(repoRoot, args, options = {}) {
  const outputArgument = parseOutputArgument(args)
  if (!outputArgument) {
    throw new Error('Remote VSIX packaging requires an explicit --out path inside the GitHub Actions runner temp directory')
  }
  const outputPath = path.resolve(repoRoot, outputArgument.value)
  if (path.extname(outputPath).toLowerCase() !== '.vsix') {
    throw new Error(`VSIX output must use the .vsix extension: ${outputPath}`)
  }

  const lexicalRepoRoot = path.resolve(repoRoot)
  if (isSameOrDescendant(lexicalRepoRoot, outputPath)) {
    throw new Error(`VSIX output must stay outside the repository: ${outputPath}`)
  }
  const runnerTemp = options.runnerTemp ? path.resolve(options.runnerTemp) : undefined
  if (runnerTemp && !isSameOrDescendant(runnerTemp, outputPath)) {
    throw new Error(`VSIX output must stay inside the GitHub Actions runner temp directory: ${outputPath}`)
  }
  if (runnerTemp) fs.mkdirSync(runnerTemp, { recursive: true })
  const realRepoRoot = fs.realpathSync.native(lexicalRepoRoot)
  const realRunnerTemp = runnerTemp ? fs.realpathSync.native(runnerTemp) : undefined
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const realOutputDirectory = fs.realpathSync.native(path.dirname(outputPath))
  if (isSameOrDescendant(realRepoRoot, realOutputDirectory)) {
    throw new Error(`VSIX output directory resolves inside the repository: ${realOutputDirectory}`)
  }
  if (realRunnerTemp && !isSameOrDescendant(realRunnerTemp, realOutputDirectory)) {
    throw new Error(`VSIX output directory must resolve inside the GitHub Actions runner temp directory: ${realOutputDirectory}`)
  }

  const forwarded = [...args]
  if (forwarded[outputArgument.index].startsWith('--out=')) {
    forwarded[outputArgument.index] = `--out=${outputPath}`
  } else {
    forwarded[outputArgument.valueIndex] = outputPath
  }
  return { outputPath, args: forwarded }
}

function requireGitHubActionsRunner() {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('VSIX packaging is remote-only. Let GitHub Actions build the package from a release tag.')
  }
  if (!process.env.RUNNER_TEMP) {
    throw new Error('GitHub Actions RUNNER_TEMP is required for VSIX packaging.')
  }
  fs.mkdirSync(process.env.RUNNER_TEMP, { recursive: true })
  return process.env.RUNNER_TEMP
}

function main() {
  const runnerTemp = requireGitHubActionsRunner()
  const repoRoot = path.resolve(__dirname, '..', '..')
  const invocation = resolveVsixInvocation(repoRoot, process.argv.slice(2), { runnerTemp })
  const vsceCli = require.resolve('@vscode/vsce/vsce')
  try {
    const result = spawnSync(process.execPath, [
      vsceCli,
      'package',
      '--no-dependencies',
      ...invocation.args,
    ], { cwd: repoRoot, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      return
    }
    console.log(`VSIX output: ${invocation.outputPath}`)
  } finally {
    cleanTransientBuildOutputs(repoRoot)
  }
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

module.exports = { isSameOrDescendant, parseOutputArgument, requireGitHubActionsRunner, resolveVsixInvocation }
