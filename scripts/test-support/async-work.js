/**
 * 等待两轮事件循环，让定时器回调启动的 Promise 链完整落到可断言状态。
 * 专项验证借此避免真实延时，同时不会把尚未执行的异步工作误判为成功。
 */
async function flushAsyncWork() {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

module.exports = { flushAsyncWork }
