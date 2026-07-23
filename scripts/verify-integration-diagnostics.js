const assert = require('node:assert/strict')

const {
  assertNoUnexpectedExtensionHostDiagnostics,
  findProjectDiagnosticsInLog,
  stripKnownExternalDiagnostics,
} = require('./run-integration-tests')

const knownDiagnostics = [
  "Warning: 'cached-data' is not in the list of known options, but still passed to Electron/Chromium.",
  '[main 2026-07-23T00:00:00.000Z] Error: Error mutex already exists\n    at Ls.installMutex (main.js:1:1\n)',
  "[vscode.mermaid-markdown-features]: Extension 'vscode.mermaid-markdown-features' CANNOT use 'legacyToolReferenceFullNames' without the 'chatParticipantPrivate' API proposal enabled",
  'SettingsEditor2: Settings not included in settingsLayout.ts: example.setting',
  '(node:123) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized\n(Use `Code --trace-deprecation ...` to show where the warning was created)',
].join('\n')

const stripped = stripKnownExternalDiagnostics(knownDiagnostics)
assert.equal(stripped.count, 5)
assert.equal(stripped.remaining.trim(), '')
assert.equal(assertNoUnexpectedExtensionHostDiagnostics(knownDiagnostics, ''), 5)
assert.throws(
  () => assertNoUnexpectedExtensionHostDiagnostics('Error: CodeBookmark activation failed', ''),
  /Unexpected Extension Host diagnostics/,
)
assert.throws(
  () => assertNoUnexpectedExtensionHostDiagnostics('', 'unclassified stderr output'),
  /Unexpected Extension Host diagnostics/,
)

const path = require('node:path')
const root = path.resolve('workspace', 'CodeBookmark')
assert.deepEqual(findProjectDiagnosticsInLog(
  '2026-07-23 13:00:00.000 [error] Error: Channel closed\n'
    + `  at Logger.error (${path.join(root, 'out', 'extension.js')}:10:2)\n`
    + '2026-07-23 13:00:01.000 [info] Extension host stopped',
  root,
  'exthost.log',
).length, 1)
assert.deepEqual(findProjectDiagnosticsInLog(
  '2026-07-23 13:00:00.000 [warning] Built-in warning\n'
    + '  at vscode.git (extension.js:10:2)',
  root,
  'exthost.log',
), [])
assert.deepEqual(findProjectDiagnosticsInLog(
  '[ERROR] Failed to initialize CodeBookmark',
  root,
  'CodeBookmark.log',
).length, 1)

console.log('Integration diagnostic classification contract verified.')
