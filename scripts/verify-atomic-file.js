/**
 * 覆盖原子写入与复制的成功、替换失败和临时文件清理，原目标内容不能因半次操作损坏。
 * 脚本在临时目录中调用编译后的 `AtomicFile` 完成真实操作，检查落盘结果而不是内存假象。
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
