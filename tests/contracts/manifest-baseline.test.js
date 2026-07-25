/**
 * 从生成后的 package.json 检查扩展身份、工作区能力、命令唯一性和多语种文档入口。
 * 这些断言保护 Marketplace 兼容面，防止普通重构意外改变扩展 ID 或打包边界。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { describe, it } = require('node:test')

const root = path.resolve(__dirname, '..', '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const { README_DOCUMENTS, readmeDocumentForLanguage } = require(path.join(root, 'out', 'i18n', 'ReadmeDocuments'))

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

  it('publishes every localized README and the bilingual changelog documents', () => {
    for (const requiredFile of [
      ...README_DOCUMENTS,
      'CHANGELOG.md',
      'docs/CHANGELOG.en.md',
    ]) {
      assert.ok(manifest.files.includes(requiredFile), `Missing packaged document: ${requiredFile}`)
    }
  })

  it('maps every supported interface language to its packaged README', () => {
    assert.deepEqual([
      readmeDocumentForLanguage('zh-cn'), readmeDocumentForLanguage('zh-hk'),
      readmeDocumentForLanguage('zh-tw'), readmeDocumentForLanguage('en'),
      readmeDocumentForLanguage('ja'), readmeDocumentForLanguage('vi'),
      readmeDocumentForLanguage('ko'), readmeDocumentForLanguage('es'),
      readmeDocumentForLanguage('fr'), readmeDocumentForLanguage('pt'),
      readmeDocumentForLanguage('ru'), readmeDocumentForLanguage('de'),
      readmeDocumentForLanguage('it'),
    ], README_DOCUMENTS)
  })
})
