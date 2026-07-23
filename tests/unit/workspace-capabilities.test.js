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
