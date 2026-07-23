/**
 * 模块说明：本文件负责行为契约与回归验证，具体对象为 `verify-code-marker-document-sync`。
 *
 * 实现要点：构造隔离夹具或模块替身，直接调用编译结果并以断言锁定 `verify-code-marker-document-sync` 对应契约。
 * 核心边界：通过断言锁定“verify-code-marker-document-sync”相关行为，任何失败都表示实现偏离既有契约。
 * 主要入口：`createPort`、`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
 */
const assert = require('node:assert/strict')
const {
  synchronizeCodeMarkersInDocument,
  synchronizeCodeMarkersForUris,
  synchronizeOpenCodeMarkerDocuments,
} = require('../out/providers/CodeMarkerDocumentSync')

function createPort(overrides = {}) {
  const events = []
  let generation = overrides.generation ?? 1
  const port = {
    initializeLanguageProfiles: async () => events.push('initialize'),
    currentGeneration: () => generation,
    isFileUri: uri => uri.scheme === 'file',
    isCurrentScope: uri => uri.inScope !== false,
    documentUri: document => document.uri,
    documentLines: document => document.lines,
    documentLanguage: document => document.languageId,
    readSource: async uri => {
      events.push(`read:${uri.path}`)
      if (overrides.invalidateOnRead) generation++
      return overrides.sources?.[uri.path]
    },
    synchronizeSnapshot: (uri, lines, languageId) => {
      events.push(`sync:${uri.path}:${lines.join('|')}:${languageId ?? 'none'}`)
      return { changed: overrides.changed !== false }
    },
    persistChanges: paths => events.push(`persist:${paths.map(uri => uri.path).join(',')}`),
  }
  return { events, port, setGeneration: value => { generation = value } }
}

async function main() {
  let harness = createPort({ changed: true })
  const document = { uri: { scheme: 'file', path: 'main.ts' }, lines: ['// TODO'], languageId: 'typescript' }
  assert.equal(await synchronizeCodeMarkersInDocument(document, harness.port), true)
  assert.deepEqual(harness.events, [
    'initialize',
    'sync:main.ts:// TODO:typescript',
    'persist:main.ts',
  ])

  harness = createPort({
    sources: {
      'a.ts': { lines: ['// TODO'], languageId: 'typescript' },
      'b.ts': undefined,
    },
  })
  await synchronizeCodeMarkersForUris([
    { scheme: 'untitled', path: 'skip' },
    { scheme: 'file', path: 'a.ts' },
    { scheme: 'file', path: 'b.ts', inScope: false },
  ], harness.port)
  assert.deepEqual(harness.events, [
    'initialize',
    'read:a.ts',
    'sync:a.ts:// TODO:typescript',
    'persist:a.ts',
  ])

  harness = createPort({ invalidateOnRead: true, sources: { 'stale.ts': { lines: ['// TODO'] } } })
  await synchronizeCodeMarkersForUris([{ scheme: 'file', path: 'stale.ts' }], harness.port)
  assert.deepEqual(harness.events, ['initialize', 'read:stale.ts'])

  harness = createPort({ changed: false })
  synchronizeOpenCodeMarkerDocuments([
    { uri: { scheme: 'file', path: 'open.ts' }, lines: ['// TODO'], languageId: 'typescript' },
    { uri: { scheme: 'file', path: 'outside.ts', inScope: false }, lines: ['// TODO'], languageId: 'typescript' },
  ], harness.port)
  assert.deepEqual(harness.events, ['sync:open.ts:// TODO:typescript', 'persist:'])

  console.log('CodeMarkerDocumentSync contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
