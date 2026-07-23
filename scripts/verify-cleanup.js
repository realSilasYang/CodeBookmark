const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const { loadLocalizedManifest } = require('./lib/localized-manifest')
const manifest = loadLocalizedManifest('zh-cn')
const { Commands } = require(path.join(root, 'out', 'util', 'constants', 'Commands'))

assert.equal('activationEvents' in manifest, false)
assert.equal(fs.existsSync(path.join(root, '.vscodeignore')), false, 'manifest.files is the only package filter')
assert.deepEqual(manifest.files, [
  'out/extension.js',
  'resources',
  'package.nls*.json',
  'README.md',
  'docs/README.en.md',
  'CHANGELOG.md',
  'docs/CHANGELOG.en.md',
  'LICENSE',
  'docs/legal/THIRD_PARTY_NOTICES.md',
  'docs/legal/licenses',
])
for (const releaseDocument of [
  'README.md',
  'docs/README.en.md',
  'CHANGELOG.md',
  'docs/CHANGELOG.en.md',
  'LICENSE',
  'docs/legal/THIRD_PARTY_NOTICES.md',
  path.join('docs', 'legal', 'licenses', 'Apache-2.0.txt'),
  path.join('docs', 'legal', 'licenses', 'CC-BY-4.0.txt'),
  path.join('docs', 'legal', 'licenses', 'CC0-1.0.txt'),
  path.join('docs', 'legal', 'licenses', 'Flat-Color-Icons-MIT.txt'),
  path.join('docs', 'legal', 'licenses', 'Fluent-Emoji-MIT.txt'),
  path.join('docs', 'legal', 'licenses', 'VSCode-Icons-MIT.txt'),
]) {
  assert.equal(fs.existsSync(path.join(root, releaseDocument)), true, `${releaseDocument} must exist`)
}

const contributedCommands = manifest.contributes.commands.map(command => command.command).sort()
const sourceCommands = [
  ...Object.values(Commands.bookmarkCommands),
  ...Commands.undoCommands,
  ...Commands.redoCommands,
].map(command => command.command).sort()
assert.deepEqual(contributedCommands, sourceCommands)
assert.equal(new Set(contributedCommands).size, contributedCommands.length)

assert.deepEqual(
  manifest.contributes.colors.map(color => color.id).sort(),
  ['codebookmark.color.Lvl1Orange', 'codebookmark.color.Lvl2Blue']
)
