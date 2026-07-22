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
    findFiles: async (_folder, glob, limit) => {
      events.push(`find:${glob}:${limit}`)
      if (overrides.discoveryError === glob) throw new Error(`failure:${glob}`)
      return overrides.matches?.[glob] ?? []
    },
    uriKey: uri => uri.path,
    isCurrent: (scope, generation) => {
      events.push(`current:${scope}:${generation}`)
      return current
    },
    warnDiscoveryTruncated: scope => events.push(`truncated:${scope}`),
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
    measure: (startedAt, files, changed) => events.push(`measure:${startedAt}:${files}:${changed}`),
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
    sources: { 'a.ts': { lines: ['// TODO'] } },
    existing: [{ uri: { path: 'missing.ts' }, knownMarkerFile: true }],
  })
  await scanWorkspaceCodeMarkers('workspace:one', 3, 10, 2, harness.port)
  assert.equal(harness.events.includes('read:a.ts:false'), true)
  assert.equal(harness.events.includes('read:duplicate.ts:false'), true)
  assert.equal(harness.events.includes('remove:b.js'), true)
  assert.equal(harness.events.includes('missing:missing.ts'), true)
  assert.equal(harness.events.includes('complete:workspace:one'), true)
  assert.equal(harness.events.includes('measure:12:4:3'), true)

  harness = createHarness({ discoveryError: '*.ts', matches: { '*.js': [{ path: 'ok.js' }] }, sources: { 'ok.js': { lines: ['// BUG'] } } })
  await scanWorkspaceCodeMarkers('workspace:one', 4, 10, 1, harness.port)
  assert.equal(harness.events.includes('failure:*.ts:failure:*.ts'), true)
  assert.equal(harness.events.includes('sync:ok.js:// BUG'), true)

  harness = createHarness({ invalidateOnRead: true, matches: { '*.ts': [{ path: 'stale.ts' }] }, sources: { 'stale.ts': { lines: ['// TODO'] } } })
  await scanWorkspaceCodeMarkers('workspace:one', 5, 10, 1, harness.port)
  assert.equal(harness.events.includes('complete:workspace:one'), false)
  assert.equal(harness.events.some(event => event.startsWith('persist:')), false)

  harness = createHarness({ matches: { '*.ts': [{ path: 'a.ts' }, { path: 'b.ts' }] }, sources: { 'a.ts': { lines: ['// TODO'] }, 'b.ts': { lines: ['// BUG'] } } })
  await scanWorkspaceCodeMarkers('workspace:one', 6, 1, 1, harness.port)
  assert.equal(harness.events.includes('truncated:workspace:one'), true)

  console.log('WorkspaceCodeMarkerScanRunner contract verified.')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
