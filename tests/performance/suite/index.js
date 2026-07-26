/**
 * 在真实 Extension Host 中等待一次完整工作区自动标记扫描，并把结构化测量写回隔离目录。
 * 测试 API 只在 CODEBOOKMARK_INTEGRATION_TEST 环境开放，不扩大正式扩展的公开能力。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const vscode = require('vscode')

async function run() {
  const resultPath = process.env.CODEBOOKMARK_PERF_RESULT_PATH
  assert.ok(resultPath, 'Performance result path must be explicit')
  const extension = vscode.extensions.all.find(candidate => candidate.packageJSON?.name === 'codebookmark')
  assert.ok(extension, 'CodeBookmark extension is unavailable in the benchmark host')
  const api = await extension.activate()
  assert.ok(api.integration, 'CodeBookmark integration API is unavailable')
  await api.integration.waitUntilReady(30_000)

  const deadline = Date.now() + 60_000
  let measurement
  while (!measurement && Date.now() < deadline) {
    measurement = api.integration.performanceMeasurement('workspace-code-marker-scan')
    if (!measurement) await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.ok(measurement, 'Workspace code-marker scan did not complete in time')
  await fs.writeFile(resultPath, JSON.stringify(measurement), 'utf8')
}

module.exports = { run }
