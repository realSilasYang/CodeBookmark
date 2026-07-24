/**
 * 检查加载会话身份递增、旧请求取消和当前性判断。
 * 脚本直接调用编译后的 `ViewLoadSession`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { ViewLoadSession } = require('../out/providers/ViewLoadSession')

const session = new ViewLoadSession()
assert.equal(session.generation, 0)
assert.equal(session.loadingGeneration, undefined)
const initialSignal = session.signalFor(0)
assert.ok(initialSignal)
assert.equal(initialSignal.aborted, false)

session.markLoading(0)
assert.equal(session.loadingGeneration, 0)
const firstGeneration = session.begin()
assert.equal(firstGeneration, 1)
assert.equal(session.generation, 1)
assert.equal(initialSignal.aborted, true)
assert.equal(session.signalFor(0), undefined)
const firstSignal = session.signalFor(firstGeneration)
assert.ok(firstSignal)
assert.equal(firstSignal.aborted, false)

session.markLoading(firstGeneration)
session.finishLoading(0)
assert.equal(session.loadingGeneration, firstGeneration)
session.finishLoading(firstGeneration)
assert.equal(session.loadingGeneration, undefined)

const secondGeneration = session.begin()
const secondSignal = session.signalFor(secondGeneration)
assert.ok(secondSignal)
session.markLoading(secondGeneration)
session.dispose()
assert.equal(secondSignal.aborted, true)
assert.equal(session.generation, secondGeneration + 1)
assert.equal(session.signalFor(secondGeneration), undefined)
assert.equal(session.signalFor(session.generation), undefined)
assert.equal(session.loadingGeneration, undefined)

console.log('ViewLoadSession contract verified.')
