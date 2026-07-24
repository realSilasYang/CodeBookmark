/**
 * 遍历全部一方维护脚本，检查中文模块说明、直译或模板化措辞以及遗留的纯英文说明注释。
 * 脚本读取仓库真实文件，围绕“遍历全部一方维护脚本”核对结构和调用顺序，不复制一份实现来验证自己。
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
  .filter(fileName => fs.existsSync(path.join(repositoryRoot, fileName)))
  .filter(fileName => maintainedRoots.some(root => fileName.startsWith(root)))
  .filter(fileName => supportedExtensions.has(path.extname(fileName).toLowerCase()))
  .sort()

const missingHeaders = []
const incompleteHeaders = []
const templateHeaders = []
const duplicateHeaders = []
const duplicateHeaderLines = []
const englishComments = []
const headersByText = new Map()
const headerLinesByText = new Map()

const rejectedHeaderPhrases = [
  '模块说明：',
  '实现要点：',
  '核心边界：',
  '主要入口：',
  '维护约束：',
  '具体对象为',
  '保持输入输出、错误处理、异步时序和持久化格式稳定',
  '注释只解释意图与约束',
  '构造隔离夹具或模块替身',
  '通过小型端口连接纯逻辑与 VS Code API',
]

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

function moduleHeader(source, yaml) {
  if (yaml) return /^(?:#[^\r\n]*\r?\n?)+/u.exec(source)?.[0]
  return /^\/\*\*[\s\S]*?\*\//u.exec(source)?.[0]
}

function chineseHeaderLines(header, yaml) {
  return header
    .split(/\r?\n/u)
    .map(line => yaml
      ? line.replace(/^#\s?/u, '').trim()
      : line.replace(/^\s*(?:\/\*\*|\*\/|\*)\s?/u, '').trim())
    .filter(line => /\p{Script=Han}/u.test(line))
}

for (const fileName of files) {
  const absolutePath = path.join(repositoryRoot, fileName)
  const source = fs.readFileSync(absolutePath, 'utf8')
  const extension = path.extname(fileName).toLowerCase()
  const yaml = extension === '.yml' || extension === '.yaml'
  const header = moduleHeader(source, yaml)
  if (!header || !source.startsWith(yaml ? '#' : '/**')) {
    missingHeaders.push(fileName)
  } else {
    const lines = chineseHeaderLines(header, yaml)
    if (lines.length < 2 || lines.some(line => !/[。！？]$/u.test(line))) {
      incompleteHeaders.push(fileName)
    }
    const rejected = rejectedHeaderPhrases.filter(phrase => header.includes(phrase))
    if (rejected.length > 0) templateHeaders.push(`${fileName}:${rejected.join('、')}`)
    const normalized = lines.join('')
    const previous = headersByText.get(normalized)
    if (previous) duplicateHeaders.push(`${previous} <=> ${fileName}`)
    else headersByText.set(normalized, fileName)
    for (const line of lines) {
      const previousLine = headerLinesByText.get(line)
      if (previousLine) duplicateHeaderLines.push(`${previousLine} <=> ${fileName}:${line}`)
      else headerLinesByText.set(line, fileName)
    }
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
  `以下脚本的模块说明至少需要两句完整中文：\n${incompleteHeaders.join('\n')}`,
)
assert.deepEqual(templateHeaders, [], `以下模块说明仍在使用旧模板：\n${templateHeaders.join('\n')}`)
assert.deepEqual(duplicateHeaders, [], `以下文件复用了相同模块说明：\n${duplicateHeaders.join('\n')}`)
assert.deepEqual(duplicateHeaderLines, [], `以下文件复用了相同说明句：\n${duplicateHeaderLines.join('\n')}`)
assert.deepEqual(englishComments, [], `以下说明注释仍只有英文：\n${englishComments.join('\n')}`)

console.log(`中文脚本注释覆盖验证通过：${files.length} 个文件。`)
