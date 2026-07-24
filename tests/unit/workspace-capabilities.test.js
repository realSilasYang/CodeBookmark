/**
 * 验证受信任工作区允许 AI，未受信任工作区限制全部会改变或发送 AI 请求的设置。
 * 测试同时锁定受限键清单，新增敏感配置时若遗漏声明会立即失败。
 */
const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const {
  RESTRICTED_WORKSPACE_CONFIGURATION_KEYS,
  workspaceAllowsAI,
} = require('../../out/util/WorkspaceCapabilities')

describe('workspace capabilities', () => {
  it('allows AI only in trusted workspaces', () => {
    assert.equal(workspaceAllowsAI(true), true)
    assert.equal(workspaceAllowsAI(false), false)
  })

  it('restricts every setting that can redirect or shape AI requests', () => {
    assert.deepEqual(RESTRICTED_WORKSPACE_CONFIGURATION_KEYS, [
      'codebookmark.globalStoragePath',
      'codebookmark.AI.address',
      'codebookmark.AI.APIKey',
      'codebookmark.AI.model',
      'codebookmark.AI.assignIcons',
      'codebookmark.AI.timeoutS',
      'codebookmark.AI.prompt',
      'codebookmark.AI.optimizePrompt',
    ])
  })
})
