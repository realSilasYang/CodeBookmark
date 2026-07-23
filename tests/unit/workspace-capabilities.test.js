/**
 * 模块说明：本文件负责纯逻辑单元测试，具体对象为 `workspace-capabilities.test`。
 *
 * 实现要点：用小型夹具覆盖正常输入、非法输入和边界状态，保持测试快速且可重复。
 * 核心边界：测试使用可重复的输入与隔离环境验证公开行为，不依赖人工界面判断。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
