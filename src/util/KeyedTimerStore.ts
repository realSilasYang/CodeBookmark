/**
 * 按业务键持有可替换定时器，集中处理防抖替换、范围取消和停用清理。
 * 已被替换的回调即使因事件循环竞争仍被调用，也不会误删同键的新定时器。
 */
export interface TimerScheduling<Timer> {
	setTimer(callback: () => void, delay: number): Timer
	clearTimer(timer: Timer): void
}

export const defaultTimerScheduling: TimerScheduling<ReturnType<typeof setTimeout>> = {
	setTimer: (callback, delay) => setTimeout(callback, delay),
	clearTimer: timer => clearTimeout(timer),
}

export class KeyedTimerStore<Key, Timer> {
	private readonly timers = new Map<Key, Timer>()

	constructor(private readonly scheduling: TimerScheduling<Timer>) {}

	replace(key: Key, callback: () => void, delay: number): void {
		const previous = this.timers.get(key)
		if (previous !== undefined) this.scheduling.clearTimer(previous)
		const timer = this.scheduling.setTimer(() => {
			if (this.timers.get(key) === timer) this.timers.delete(key)
			callback()
		}, delay)
		this.timers.set(key, timer)
	}

	cancelWhere(predicate: (key: Key) => boolean): void {
		for (const [key, timer] of this.timers) {
			if (!predicate(key)) continue
			this.scheduling.clearTimer(timer)
			this.timers.delete(key)
		}
	}

	clear(): void {
		for (const timer of this.timers.values()) this.scheduling.clearTimer(timer)
		this.timers.clear()
	}
}
