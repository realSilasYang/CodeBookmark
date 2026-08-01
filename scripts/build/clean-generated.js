/**
 * 清理本地开发产生的构建、测试和发布生成物，保持仓库根目录只展示源码入口。
 * 删除范围固定在仓库内已忽略的输出文件，不触碰依赖目录和用户源码改动。
 */
const fs = require('node:fs')
const path = require('node:path')
const { GENERATED_NLS_PATTERN } = require('../lib/manifest-language-catalogs')

const root = path.resolve(__dirname, '..', '..')

function isInsideRoot(target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function removePath(relativePath) {
  const target = path.resolve(root, relativePath)
  if (!isInsideRoot(target)) throw new Error(`Refusing to clean outside the repository: ${relativePath}`)
  fs.rmSync(target, { recursive: true, force: true })
}

function removeRootFilesMatching(pattern) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue
    removePath(entry.name)
  }
}

for (const directory of ['out', '.vscode-test', 'coverage', 'release']) {
  removePath(directory)
}
for (const pattern of [
  GENERATED_NLS_PATTERN,
  /^.*\.vsix$/u,
  /^.*\.tgz$/u,
  /^.*\.log$/u,
  /^.*_debug\.json$/u,
]) {
  removeRootFilesMatching(pattern)
}

console.log('Cleaned generated build, test, package, and root scratch artifacts.')
