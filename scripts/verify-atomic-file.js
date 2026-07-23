/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-atomic-file`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-atomic-file` 对应契约。
 * 核心边界：通过断言锁定“verify-atomic-file”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  atomicCopyFile,
  atomicWriteFile,
  temporarySiblingPath,
} = require('../out/util/AtomicFile')

async function main() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-atomic-'))
  try {
    const target = path.join(sandbox, 'nested', 'value.json')
    assert.match(temporarySiblingPath(target), /\.\d+\.\d+\.tmp$/)

    await atomicWriteFile(target, '{"value":1}')
    assert.equal(fs.readFileSync(target, 'utf8'), '{"value":1}')
    assert.deepEqual(fs.readdirSync(path.dirname(target)), ['value.json'])

    await atomicWriteFile(target, Buffer.from('replacement'))
    assert.equal(fs.readFileSync(target, 'utf8'), 'replacement')

    const copy = path.join(sandbox, 'copy', 'value.json')
    await atomicCopyFile(target, copy)
    assert.equal(fs.readFileSync(copy, 'utf8'), 'replacement')

    const directoryTarget = path.join(sandbox, 'cannot-replace')
    fs.mkdirSync(directoryTarget)
    await assert.rejects(() => atomicWriteFile(directoryTarget, 'value'))
    assert.deepEqual(
      fs.readdirSync(sandbox).filter(name => name.startsWith('cannot-replace.')),
      [],
    )
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
