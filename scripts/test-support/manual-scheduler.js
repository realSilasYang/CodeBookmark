/**
 * 为防抖和生命周期专项验证提供可手动推进的定时器，不等待真实时间。
 * 清理后的定时器仍保留在 clearedTimers 中，测试可以主动触发它来模拟事件循环竞态。
 */
class ManualScheduler {
  constructor(events = [], options = {}) {
    this.events = events
    this.timers = []
    this.clearedTimers = []
    this.clearEvent = options.clearEvent ?? (timer => `timer:clear:${timer.delay}`)
  }

  setTimer(callback, delay) {
    const timer = { callback, delay }
    this.timers.push(timer)
    this.events.push(`timer:${delay}`)
    return timer
  }

  clearTimer(timer) {
    const index = this.timers.indexOf(timer)
    if (index >= 0) this.timers.splice(index, 1)
    this.clearedTimers.push(timer)
    this.events.push(this.clearEvent(timer))
  }

  runNext(message = 'Expected a scheduled timer') {
    const timer = this.timers.shift()
    if (!timer) throw new Error(message)
    timer.callback()
  }

  runDelay(delay) {
    const index = this.timers.findIndex(timer => timer.delay === delay)
    if (index < 0) throw new Error(`Expected a ${delay}ms timer`)
    const [timer] = this.timers.splice(index, 1)
    timer.callback()
  }
}

module.exports = { ManualScheduler }
