/**
 * 统一验证显式 VSIX 输出位置并调用仓库锁定版本的 vsce，不在开发机上创建默认产物目录。
 * CI 与正式发布传入临时路径；所有输出都经过词法路径与真实目录双重边界检查，仓库内部路径会在打包前被拒绝。
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

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

function resolveVsixInvocation(repoRoot, args) {
  const outputArgument = parseOutputArgument(args)
  if (!outputArgument) {
    throw new Error('VSIX output path must be explicit; pass --out with a path outside the repository')
  }
  const outputPath = path.resolve(repoRoot, outputArgument.value)
  if (path.extname(outputPath).toLowerCase() !== '.vsix') {
    throw new Error(`VSIX output must use the .vsix extension: ${outputPath}`)
  }

  const realRepoRoot = fs.realpathSync.native(repoRoot)
  if (isSameOrDescendant(realRepoRoot, outputPath)) {
    throw new Error(`VSIX output must stay outside the repository: ${outputPath}`)
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const realOutputDirectory = fs.realpathSync.native(path.dirname(outputPath))
  if (isSameOrDescendant(realRepoRoot, realOutputDirectory)) {
    throw new Error(`VSIX output directory resolves inside the repository: ${realOutputDirectory}`)
  }

  const forwarded = [...args]
  if (forwarded[outputArgument.index].startsWith('--out=')) {
    forwarded[outputArgument.index] = `--out=${outputPath}`
  } else {
    forwarded[outputArgument.valueIndex] = outputPath
  }
  return { outputPath, args: forwarded }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const invocation = resolveVsixInvocation(repoRoot, process.argv.slice(2))
  const vsceCli = require.resolve('@vscode/vsce/vsce')
  const result = spawnSync(process.execPath, [
    vsceCli,
    'package',
    '--no-dependencies',
    ...invocation.args,
  ], { cwd: repoRoot, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log(`VSIX output: ${invocation.outputPath}`)
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

module.exports = { isSameOrDescendant, parseOutputArgument, resolveVsixInvocation }
