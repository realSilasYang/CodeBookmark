const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const { Commands } = require(path.join(root, 'out', 'util', 'constants', 'Commands'))

assert.equal('activationEvents' in manifest, false)
assert.equal(fs.existsSync(path.join(root, '.vscodeignore')), false, 'manifest.files is the only package filter')
assert.deepEqual(manifest.files, [
  'out/**/*.js',
  'resources',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_LICENSES',
])
for (const releaseDocument of [
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
  path.join('THIRD_PARTY_LICENSES', 'Apache-2.0.txt'),
  path.join('THIRD_PARTY_LICENSES', 'CC-BY-4.0.txt'),
  path.join('THIRD_PARTY_LICENSES', 'CC0-1.0.txt'),
  path.join('THIRD_PARTY_LICENSES', 'Flat-Color-Icons-MIT.txt'),
  path.join('THIRD_PARTY_LICENSES', 'Fluent-Emoji-MIT.txt'),
  path.join('THIRD_PARTY_LICENSES', 'VSCode-Icons-MIT.txt'),
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
