/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-view-load-session`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-view-load-session` 对应契约。
 * 核心边界：通过断言锁定“verify-view-load-session”相关行为，任何失败都表示实现偏离既有契约。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
