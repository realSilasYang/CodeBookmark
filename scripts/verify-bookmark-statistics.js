const assert = require('node:assert/strict')
const {
  formatBookmarkLevelSummary,
  mergeBookmarkLevelSummaries,
  summarizeBookmarkLevels,
  summarizeBookmarks,
  summarizeBookmarkTrees,
} = require('../out/util/BookmarkStatistics')

function node(options = {}) {
  return {
    isFile: options.isFile ?? false,
    parent: options.parent,
    subs: options.subs ?? [],
  }
}

function attach(parent, child) {
  child.parent = parent
  parent.subs.push(child)
  return child
}

const empty = summarizeBookmarkTrees([])
assert.deepEqual(empty, { total: 0, levelCounts: [] })
assert.equal(formatBookmarkLevelSummary(empty), '共 0 个书签')

const file = node({ isFile: true })
const firstRoot = attach(file, node())
const secondRoot = attach(file, node())
const secondLevel = attach(firstRoot, node())
const thirdLevel = attach(secondLevel, node())
attach(thirdLevel, node())
attach(secondRoot, node())

const treeSummary = summarizeBookmarkTrees([file])
assert.deepEqual(treeSummary, { total: 6, levelCounts: [2, 2, 1, 1] })
assert.equal(
  formatBookmarkLevelSummary(treeSummary),
  '共 6 个书签：一级 2 个、二级 2 个、三级 1 个、四级 1 个',
)

assert.deepEqual(
  summarizeBookmarks([secondLevel, thirdLevel, thirdLevel]),
  { total: 2, levelCounts: [0, 1, 1] },
)
assert.deepEqual(
  summarizeBookmarkLevels([1, 3, 3, 11, 0, Number.NaN]),
  { total: 4, levelCounts: [1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1] },
)
assert.equal(
  formatBookmarkLevelSummary(summarizeBookmarkLevels([11])),
  '共 1 个书签：一级 0 个、二级 0 个、三级 0 个、四级 0 个、五级 0 个、六级 0 个、七级 0 个、八级 0 个、九级 0 个、十级 0 个、第 11 级 1 个',
)

assert.deepEqual(
  mergeBookmarkLevelSummaries(
    { total: 99, levelCounts: [1, 2] },
    { total: 99, levelCounts: [3, 0, 4] },
  ),
  { total: 10, levelCounts: [4, 2, 4] },
)

thirdLevel.subs.push(firstRoot)
assert.deepEqual(summarizeBookmarkTrees([file]), treeSummary)

console.log('Bookmark statistics contract verified.')
