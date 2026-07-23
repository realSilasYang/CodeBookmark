/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-chinese-comments`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-chinese-comments` 对应契约。
 * 核心边界：检查全部一方维护且语法支持注释的脚本，确保中文说明覆盖完整，
 * 同时允许 eslint、TypeScript、覆盖率工具等必须保持原文的机器指令。
 * 维护约束：新增脚本或说明注释时必须同步满足本守卫，不能用数据字符串冒充源码注释。
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')

const repositoryRoot = path.resolve(__dirname, '..')
const supportedExtensions = new Set(['.ts', '.js', '.mjs', '.yml', '.yaml'])
const maintainedRoots = ['.github/', 'config/', 'scripts/', 'src/', 'tests/']
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: repositoryRoot, encoding: 'utf8' },
)
  .split(/\r?\n/u)
  .filter(Boolean)
  .map(fileName => fileName.replace(/\\/g, '/'))
  .filter(fileName => maintainedRoots.some(root => fileName.startsWith(root)))
  .filter(fileName => supportedExtensions.has(path.extname(fileName).toLowerCase()))
  .sort()

const missingHeaders = []
const incompleteHeaders = []
const englishComments = []

function sourceCommentRanges(source, fileName) {
  const scriptKind = fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind)
  const ranges = new Map()
  const addRanges = values => {
    for (const value of values ?? []) ranges.set(`${value.pos}:${value.end}`, value)
  }
  addRanges(ts.getLeadingCommentRanges(source, 0))
  const visit = node => {
    addRanges(ts.getLeadingCommentRanges(source, node.pos))
    addRanges(ts.getTrailingCommentRanges(source, node.end))
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return [...ranges.values()]
}

function lineNumberAt(source, offset) {
  let line = 1
  for (let index = 0; index < offset; index++) {
    if (source[index] === '\n') line++
  }
  return line
}

function isMachineDirective(comment) {
  return /^\/\/[#@]?\s*(?:eslint|prettier|ts-|istanbul|c8|v8)\b/iu.test(comment)
    || /^\/\*[#@]?__PURE__\*\/$/u.test(comment.trim())
}

for (const fileName of files) {
  const absolutePath = path.join(repositoryRoot, fileName)
  const source = fs.readFileSync(absolutePath, 'utf8')
  const extension = path.extname(fileName).toLowerCase()
  const yaml = extension === '.yml' || extension === '.yaml'
  const expectedHeader = yaml ? '# 配置说明：' : '/**\n * 模块说明：'
  if (!source.replace(/\r\n/g, '\n').startsWith(expectedHeader)) missingHeaders.push(fileName)
  const headerWindow = source.split(/\r?\n/u).slice(0, 12).join('\n')
  if (
    !headerWindow.includes('实现要点：')
    || !headerWindow.includes('核心边界：')
    || !headerWindow.includes('维护约束：')
  ) {
    incompleteHeaders.push(fileName)
  }

  if (yaml) {
    source.split(/\r?\n/u).forEach((line, index) => {
      const comment = /^\s*#(.*)$/u.exec(line)?.[1] ?? ''
      if (/[A-Za-z]/u.test(comment) && !/\p{Script=Han}/u.test(comment)) {
        englishComments.push(`${fileName}:${index + 1}:${comment.trim()}`)
      }
    })
    continue
  }

  for (const range of sourceCommentRanges(source, fileName)) {
    const comment = source.slice(range.pos, range.end)
    if (!/[A-Za-z]/u.test(comment) || /\p{Script=Han}/u.test(comment) || isMachineDirective(comment)) continue
    englishComments.push(`${fileName}:${lineNumberAt(source, range.pos)}:${comment.replace(/\s+/gu, ' ').trim()}`)
  }
}

assert.deepEqual(missingHeaders, [], `以下脚本缺少中文模块说明：\n${missingHeaders.join('\n')}`)
assert.deepEqual(
  incompleteHeaders,
  [],
  `以下脚本的中文说明缺少实现要点、核心边界或维护约束：\n${incompleteHeaders.join('\n')}`,
)
assert.deepEqual(englishComments, [], `以下说明注释仍只有英文：\n${englishComments.join('\n')}`)

console.log(`中文脚本注释覆盖验证通过：${files.length} 个文件。`)
