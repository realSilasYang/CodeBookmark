/**
 * 覆盖便携包归档、跨系统源码匹配以及追加/覆盖的三方合并，不依赖 Extension Host。
 * 测试同时构造损坏归档、重复身份和匹配并列，确认任何不确定输入都不会被静默接受。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { afterEach, describe, it } = require('node:test')

const { createPortableArchive, readPortableArchive } = require('../../out/portable/PortableArchive')
const { mergePortableBookmarks } = require('../../out/portable/PortableMerge')
const { fingerprintPortableSource } = require('../../out/portable/PortableSourceFingerprint')
const { resolvePortableScriptTarget } = require('../../out/portable/PortableTargetResolver')
const { decodePortableExchangeRecord } = require('../../out/portable/PortableExchangeStore')

const SCRIPT_ID = '10000000-0000-4000-8000-000000000001'
const ROOT_ID = '20000000-0000-4000-8000-000000000001'
const CHILD_ID = '20000000-0000-4000-8000-000000000002'
const EXCHANGE_ID = '30000000-0000-4000-8000-000000000001'
const REVISION_ID = '40000000-0000-4000-8000-000000000001'
const ROOT_DESCRIPTOR_ID = 'root-1'
const sandboxes = []

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) fs.rmSync(sandbox, { recursive: true, force: true })
})

function bookmark(id = ROOT_ID, label = 'Root', subs = []) {
  return {
    id,
    createdAt: 1700000000000,
    label,
    collapsibleState: subs.length > 0 ? 2 : 0,
    pinned: false,
    content: 'function portableAnchor() { return true }',
    contextBefore: '// stable portable context before',
    contextAfter: '// stable portable context after',
    iconName: 'status_idea_red.svg',
    isInvalid: false,
    subs,
    params: '1,0,1,10',
  }
}

function portable(bookmarks = [bookmark()], fingerprint) {
  return {
    format: 'codebookmark.portable-script',
    schemaVersion: 1,
    scriptId: SCRIPT_ID,
    fingerprint,
    bookmarks,
  }
}

function archiveFor(script = portable()) {
  return createPortableArchive({
    format: 'codebookmark.portable-package',
    schemaVersion: 1,
    exchangeId: EXCHANGE_ID,
    revisionId: REVISION_ID,
    parentRevisionIds: [],
    createdAt: 1700000000000,
    title: 'Portable Test',
    scope: 'workspace',
    roots: [{ id: ROOT_DESCRIPTOR_ID, name: 'workspace' }],
  }, [{
    index: { scriptId: SCRIPT_ID, rootId: ROOT_DESCRIPTOR_ID, relativePath: 'src/example.ts', entry: `scripts/${SCRIPT_ID}.json` },
    value: script,
  }])
}

describe('portable archive', () => {
  it('round-trips the current package and rejects old JSON input', async () => {
    const decoded = await readPortableArchive(archiveFor())
    assert.equal(decoded.manifest.scope, 'workspace')
    assert.equal(decoded.scripts.get(SCRIPT_ID).bookmarks[0].label, 'Root')
    await assert.rejects(readPortableArchive(Buffer.from('{"bookmarks":[]}')), /ZIP|archive|package/i)
  })

  it('rejects duplicate identities anywhere in a nested bookmark tree', async () => {
    const duplicate = bookmark(ROOT_ID, 'Root', [bookmark(ROOT_ID, 'Duplicate')])
    await assert.rejects(readPortableArchive(archiveFor(portable([duplicate]))), /duplicate bookmark identities/i)
  })

  it('detects a damaged package entry by its digest', async () => {
    const archive = archiveFor()
    const damaged = Uint8Array.from(archive)
    damaged[Math.floor(damaged.length / 2)] ^= 0xff
    await assert.rejects(readPortableArchive(damaged), /damaged|invalid|data|stream|archive|EOF/i)
  })
})

describe('portable source matching', () => {
  it('matches path case and Unicode composition across operating systems', async () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-portable-path-'))
    sandboxes.push(sandbox)
    const target = path.join(sandbox, 'src', 'café.ts')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'export const café = true\n')
    const result = await resolvePortableScriptTarget(
      { scriptId: SCRIPT_ID, rootId: ROOT_DESCRIPTOR_ID, relativePath: 'SRC/Cafe\u0301.ts', entry: `scripts/${SCRIPT_ID}.json`, sha256: '0'.repeat(64) },
      portable(),
      [{ absolutePath: target, relativePath: 'src/café.ts' }],
      false,
    )
    assert.equal(result.kind, 'relative-path')
    assert.equal(result.targetAbsolutePath, target)
  })

  it('ignores CRLF/LF differences but does not rely on file size', async () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-portable-lines-'))
    sandboxes.push(sandbox)
    const source = path.join(sandbox, 'source.ts')
    const target = path.join(sandbox, 'renamed.ts')
    fs.writeFileSync(source, 'const first = true\r\nconst second = true\r\n')
    fs.writeFileSync(target, 'const first = true\nconst second = true\n')
    const fingerprint = await fingerprintPortableSource(source)
    const result = await resolvePortableScriptTarget(
      { scriptId: SCRIPT_ID, rootId: ROOT_DESCRIPTOR_ID, relativePath: 'missing.ts', entry: `scripts/${SCRIPT_ID}.json`, sha256: '0'.repeat(64) },
      portable([bookmark()], fingerprint),
      [{ absolutePath: target, relativePath: 'renamed.ts' }],
      false,
    )
    assert.equal(result.kind, 'normalized-content')
    assert.equal(result.targetAbsolutePath, target)
  })

  it('uses unique bookmark anchors and refuses tied candidates', async () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codebookmark-portable-anchor-'))
    sandboxes.push(sandbox)
    const first = path.join(sandbox, 'first.ts')
    const second = path.join(sandbox, 'second.ts')
    const anchored = '// stable portable context before\nfunction portableAnchor() { return true }\n// stable portable context after\n'
    fs.writeFileSync(first, anchored)
    fs.writeFileSync(second, 'const unrelated = true\n')
    const index = { scriptId: SCRIPT_ID, rootId: ROOT_DESCRIPTOR_ID, relativePath: 'missing.ts', entry: `scripts/${SCRIPT_ID}.json`, sha256: '0'.repeat(64) }
    const unique = await resolvePortableScriptTarget(index, portable(), [
      { absolutePath: first }, { absolutePath: second },
    ], false)
    assert.equal(unique.kind, 'anchors')
    fs.writeFileSync(second, anchored)
    const tied = await resolvePortableScriptTarget(index, portable(), [
      { absolutePath: first }, { absolutePath: second },
    ], false)
    assert.equal(tied.kind, 'conflict')
  })
})

describe('portable bookmark merge', () => {
  it('is idempotent when the same revision is imported repeatedly', () => {
    const incoming = portable([bookmark(ROOT_ID, 'Imported')])
    const first = mergePortableBookmarks([], incoming, undefined, {}, 'append')
    const second = mergePortableBookmarks(first.bookmarks, incoming, incoming, first.bookmarkMappings, 'append')
    assert.equal(first.added, 1)
    assert.equal(second.added, 0)
    assert.equal(second.updated, 0)
    assert.equal(second.conflicts, 0)
    assert.equal(second.bookmarks.length, 1)
  })

  it('preserves both versions when local and incoming edits conflict', () => {
    const base = portable([bookmark(ROOT_ID, 'Base')])
    const local = [bookmark(ROOT_ID, 'Local edit')]
    const incoming = portable([bookmark(ROOT_ID, 'Remote edit')])
    const result = mergePortableBookmarks(local, incoming, base, { [ROOT_ID]: ROOT_ID }, 'append')
    assert.equal(result.conflicts, 1)
    assert.equal(result.bookmarks.length, 2)
    assert.deepEqual(result.bookmarks.map(item => item.label), ['Local edit', 'Remote edit'])
    assert.notEqual(result.bookmarks[0].id, result.bookmarks[1].id)
  })

  it('propagates an unchanged remote deletion and supports explicit overwrite', () => {
    const base = portable([bookmark(ROOT_ID, 'Base')])
    const deleted = mergePortableBookmarks([bookmark(ROOT_ID, 'Base')], portable([]), base, { [ROOT_ID]: ROOT_ID }, 'append')
    assert.equal(deleted.removed, 1)
    assert.equal(deleted.bookmarks.length, 0)

    const existing = [bookmark(ROOT_ID, 'Existing'), bookmark(CHILD_ID, 'Unrelated')]
    const replaced = mergePortableBookmarks(existing, portable([bookmark(ROOT_ID, 'Package')]), undefined, { [ROOT_ID]: ROOT_ID }, 'overwrite')
    assert.equal(replaced.bookmarks.length, 1)
    assert.equal(replaced.bookmarks[0].label, 'Package')
    assert.equal(replaced.removed, 1)
    assert.equal(replaced.conflicts, 0)
  })
})

describe('portable exchange record', () => {
  function record(overrides = {}) {
    return {
      format: 'codebookmark.portable-exchange', schemaVersion: 1,
      exchangeId: EXCHANGE_ID, scopeKey: 'workspace:/portable', lastRevisionId: REVISION_ID,
      updatedAt: 1700000000000,
      scriptMappings: { [SCRIPT_ID]: SCRIPT_ID },
      bookmarkMappings: { [ROOT_ID]: ROOT_ID },
      baseScripts: [portable()],
      ...overrides,
    }
  }

  it('validates merge baselines and one-to-one identity mappings', () => {
    assert.equal(decodePortableExchangeRecord(record()).baseScripts[0].scriptId, SCRIPT_ID)
    assert.throws(
      () => decodePortableExchangeRecord(record({ baseScripts: [{ ...portable(), bookmarks: [{ id: 'invalid' }] }] })),
      /identity|bookmark|base/i,
    )
    const otherId = '10000000-0000-4000-8000-000000000002'
    assert.throws(
      () => decodePortableExchangeRecord(record({
        scriptMappings: { [SCRIPT_ID]: SCRIPT_ID, [otherId]: SCRIPT_ID },
      })),
      /mapping/i,
    )
  })
})
