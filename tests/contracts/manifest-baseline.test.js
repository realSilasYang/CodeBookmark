const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { describe, it } = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

describe('generated extension manifest baseline', () => {
	it('declares workspace execution and explicit workspace capability boundaries', () => {
		assert.deepEqual(manifest.extensionKind, ['workspace'])
		assert.equal(manifest.capabilities.virtualWorkspaces.supported, false)
		assert.equal(manifest.capabilities.untrustedWorkspaces.supported, 'limited')
		assert.deepEqual(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations, [
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

  it('keeps extension identity and package boundaries stable', () => {
    assert.equal(manifest.name, 'codebookmark')
    assert.equal(manifest.publisher, 'realSilasYang')
    assert.equal(manifest.main, './out/extension.js')
    assert.deepEqual(manifest.dependencies, {})
    assert.equal('activationEvents' in manifest, false)
  })

  it('keeps contributed command identifiers unique', () => {
    const commandIds = manifest.contributes.commands.map(command => command.command)
    assert.equal(new Set(commandIds).size, commandIds.length)
  })

  it('publishes the bilingual README and changelog documents', () => {
    for (const requiredFile of [
      'README.md',
      'docs/README.en.md',
      'CHANGELOG.md',
      'docs/CHANGELOG.en.md',
    ]) {
      assert.ok(manifest.files.includes(requiredFile), `Missing packaged document: ${requiredFile}`)
    }
  })
})
