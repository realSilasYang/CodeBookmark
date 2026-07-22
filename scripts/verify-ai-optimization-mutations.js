const assert = require('node:assert/strict')

const {
  applyAIOptimizationChanges,
  resolveAIOptimizationChanges,
} = require('../out/util/AIOptimizationMutations')

function bookmark(id, label, icon, isUsingDefaultIcon, defaultIconName = '') {
  return {
    id,
    label,
    icon,
    isUsingDefaultIcon,
    defaultIconName,
    refreshCount: 0,
    refreshDisplayProps() {
      this.refreshCount++
    },
  }
}

const known = bookmark('known', '旧标签', '', true)
const custom = bookmark('custom', '手工标签', 'ui_tools_blue.svg', false)
const marker = bookmark('marker', 'TODO', 'status_idea_yellow.svg', true, 'status_idea_yellow.svg')
marker.codeMarker = { generatedLabel: 'TODO', iconCustomized: false }
const candidates = [known, custom, marker]

const changes = resolveAIOptimizationChanges(
  [
    { id: 'known', new_label: '新标签', iconName: 'fun_rocket_fluent.svg' },
    { id: 'custom', new_label: '更新手工标签', iconName: 'status_bug.svg' },
    { id: 'marker', iconName: 'status_bug.svg' },
    { id: 'unknown', new_label: '越权更新', iconName: 'status_bug.svg' },
  ],
  candidates,
  candidate => candidate,
  true,
  value => value,
)

assert.equal(changes.length, 3)
assert.equal(changes.find(change => change.bookmark === custom).iconName, undefined)
applyAIOptimizationChanges(changes)
assert.equal(known.label, '新标签')
assert.equal(known.icon, 'fun_rocket_fluent.svg')
assert.equal(custom.label, '更新手工标签')
assert.equal(custom.icon, 'ui_tools_blue.svg')
assert.equal(marker.icon, 'status_bug.svg')
assert.equal(marker.codeMarker.iconCustomized, true)
assert.equal(known.refreshCount, 1)
assert.equal(custom.refreshCount, 1)
assert.equal(marker.refreshCount, 1)

const disabledChanges = resolveAIOptimizationChanges(
  [{ id: 'known', iconName: 'status_debug.svg' }],
  [known],
  candidate => candidate,
  false,
  value => value,
)
assert.deepEqual(disabledChanges, [])

console.log('AIOptimizationMutations contract verified.')
