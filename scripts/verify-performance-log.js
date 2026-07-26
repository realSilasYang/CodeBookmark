/**
 * 用真实日志字段验证性能输出能区分墙钟时间与并发累计时间，并完整使用当前界面语言。
 * 示例覆盖扫描明细和视图初始化摘要，防止英文内部键或真假时间混淆重新出现。
 */
const assert = require('node:assert/strict')
const { initializeLocalization } = require('../out/i18n/Localization')
const { formatPerformanceLog } = require('../out/util/PerformanceLogFormatter')

initializeLocalization('zh-cn')

const scan = formatPerformanceLog('workspace-code-marker-scan', 1130.5, {
  files: 1896,
  changedFiles: 0,
  discoveryQueries: 4,
  discoveryMs: 130.7979,
  discoveryQueryMs: 451.5638,
  processingMs: 997.2345,
  discoveredFiles: 1896,
  openedDocuments: 1,
  openMs: 2829.6113,
  readMs: 5753.8517,
  bytesRead: 8160554,
  prefilteredFiles: 1813,
  exactScans: 83,
  exactScanMs: 74.4009,
})

assert.match(scan, /^\[性能\] 工作区代码标记扫描\n/u)
assert.match(scan, /真实耗时：总计 1130\.5 毫秒；发现文件 130\.8 毫秒；处理文件 997\.2 毫秒/u)
assert.match(scan, /文件统计：候选 1896；发现 1896；内存文档 1；读取数据 7\.78 MiB/u)
assert.match(scan, /并发累计耗时（不可与真实耗时相加）/u)
assert.match(scan, /预筛排除 1813（95\.6%）；精确扫描 83（4\.4%）；发生变化 0/u)
assert.doesNotMatch(scan, /(?:changedFiles|discoveryMs|openMs|readMs|exactScans)=/u)

const initialization = formatPerformanceLog('bookmark-view-initialization', 760.68, {
  bookmarks: 1,
  heapMiB: 288,
  failed: false,
})
assert.equal(
  initialization,
  '[性能] 书签视图初始化 真实耗时=760.7 毫秒 书签数=1 扩展宿主堆内存（MiB）=288 失败=否',
)

initializeLocalization('en')
assert.match(
  formatPerformanceLog('bookmark-view-initialization', 12.34, { failed: true }),
  /^\[PERF\] bookmark-view-initialization wall time=12\.3 ms failed=yes$/u,
)

console.log('Performance log formatting verified.')
