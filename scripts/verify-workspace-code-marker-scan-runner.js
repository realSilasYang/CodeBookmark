/**
 * 覆盖语言模式生成的工作区 glob、排除目录、数量限制、取消和批量同步。
 * 脚本直接调用编译后的 `WorkspaceCodeMarkerScanRunner`，只在 VS Code 或文件系统边界使用最小替身。
 */
const assert = require('node:assert/strict')
const { scanWorkspaceCodeMarkers } = require('../out/providers/WorkspaceCodeMarkerScanRunner')

function createHarness(overrides = {}) {
  const events = []
  let current = overrides.current ?? true
  const sources = overrides.sources ?? {}
  const port = {
    startMeasurement: () => {
      events.push('start')
      return 12
    },
    canDiscoverFiles: () => overrides.canDiscover ?? true,
    workspaceFolder: () => overrides.workspaceFolder ?? 'workspace',
    discoveryGlobs: () => ['*.ts', '*.js'],
    findFiles: async (_folder, glob) => {
      events.push(`find:${glob}`)
      if (overrides.discoveryError === glob) throw new Error(`failure:${glob}`)
      return overrides.matches?.[glob] ?? []
    },
    uriKey: uri => uri.path,
    isCurrent: (scope, generation) => {
      events.push(`current:${scope}:${generation}`)
      return current
    },
    existingMarkerCandidates: () => overrides.existing ?? [],
    scopeForUri: uri => uri.scope ?? 'workspace:one',
    isExcluded: uri => uri.excluded === true,
    readSource: async (uri, known) => {
      events.push(`read:${uri.path}:${known}`)
      if (overrides.invalidateOnRead) current = false
      return sources[uri.path]
    },
    synchronize: (uri, source) => {
      events.push(`sync:${uri.path}:${source.lines.join('|')}`)
      return { changed: overrides.changed !== false }
    },
    removeMarkers: uri => {
      events.push(`remove:${uri.path}`)
      return true
    },
    sourceIsMissing: async uri => {
      events.push(`missing:${uri.path}`)
      return true
    },
    markCompleted: scope => events.push(`complete:${scope}`),
    persistChanges: paths => events.push(`persist:${paths.map(uri => uri.path).join(',')}`),
    measure: (startedAt, metrics) => {
      events.push(`measure:${startedAt}:${metrics.files}:${metrics.changedFiles}`)
      events.push(`metrics:${metrics.discoveryQueries}:${metrics.discoveredFiles}:${metrics.exactScans}:${Number.isFinite(metrics.processingMs)}`)
    },
    reportDiscoveryFailure: (glob, error) => events.push(`failure:${glob}:${error.message}`),
  }
  return { events, port, setCurrent: value => { current = value } }
}

async function main() {
  let harness = createHarness({
    matches: {
      '*.ts': [{ path: 'a.ts' }, { path: 'duplicate.ts' }],
      '*.js': [{ path: 'duplicate.ts' }, { path: 'b.js', excluded: true }],
    },
    sources: {
      'a.ts': { lines: ['// TODO'], readMetrics: { origin: 'file', openMs: 1, readMs: 2, bytesRead: 7, prefilteredEmpty: false } },
      'duplicate.ts': { lines: [], readMetrics: { origin: 'file', openMs: 1, readMs: 2, bytesRead: 3, prefilteredEmpty: true } },
    },
    existing: [{ uri: { path: 'missing.ts' }, knownMarkerFile: true }],
  })
  await scanWorkspaceCodeMarkers('workspace:one', 3, 2, harness.port)
  assert.equal(harness.events.includes('read:a.ts:false'), true)
  assert.equal(harness.events.includes('read:duplicate.ts:false'), true)
  assert.equal(harness.events.includes('remove:b.js'), true)
  assert.equal(harness.events.includes('missing:missing.ts'), true)
  assert.equal(harness.events.includes('complete:workspace:one'), true)
  assert.equal(harness.events.includes('measure:12:4:3'), true)
  assert.equal(harness.events.includes('metrics:2:3:1:true'), true)
  assert.equal(harness.events.includes('sync:duplicate.ts:'), false)

  const cleared = createHarness({
    existing: [{ uri: { path: 'cleared.ts' }, knownMarkerFile: true }],
    sources: {
      'cleared.ts': { lines: [], readMetrics: { origin: 'file', openMs: 1, readMs: 1, bytesRead: 10, prefilteredEmpty: true } },
    },
  })
  await scanWorkspaceCodeMarkers('workspace:one', 31, 1, cleared.port)
  assert.equal(cleared.events.includes('sync:cleared.ts:'), true)

  harness = createHarness({ discoveryError: '*.ts', matches: { '*.js': [{ path: 'ok.js' }] }, sources: { 'ok.js': { lines: ['// BUG'] } } })
  await scanWorkspaceCodeMarkers('workspace:one', 4, 1, harness.port)
  assert.equal(harness.events.includes('failure:*.ts:failure:*.ts'), true)
  assert.equal(harness.events.includes('sync:ok.js:// BUG'), true)

  harness = createHarness({ invalidateOnRead: true, matches: { '*.ts': [{ path: 'stale.ts' }] }, sources: { 'stale.ts': { lines: ['// TODO'] } } })
  await scanWorkspaceCodeMarkers('workspace:one', 5, 1, harness.port)
  assert.equal(harness.events.includes('complete:workspace:one'), false)
  assert.equal(harness.events.some(event => event.startsWith('persist:')), false)

  harness = createHarness({ matches: { '*.ts': Array.from({ length: 2_100 }, (_, index) => ({ path: `${index}.ts` })) }, sources: {} })
  await scanWorkspaceCodeMarkers('workspace:one', 6, 8, harness.port)
  assert.equal(harness.events.filter(event => event.startsWith('read:')).length, 2_100)
  assert.equal(harness.events.includes('measure:12:2100:0'), true)

  console.log('WorkspaceCodeMarkerScanRunner contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
