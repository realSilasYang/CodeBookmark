const assert = require('node:assert/strict')
const fs = require('node:fs')

const provider = fs.readFileSync('src/providers/CodeBookmarkViewProvider.ts', 'utf8')
const iconPicker = fs.readFileSync('src/util/quick_pick_icon/IconPickerWebview.ts', 'utf8')

assert.equal(provider.includes('ExtensionConfig.defaultExpandLevel'), true)
assert.equal(iconPicker.includes('Content-Security-Policy'), true)
assert.equal(iconPicker.includes('webview.cspSource'), true)
assert.equal(iconPicker.includes('nonce="${nonce}"'), true)
assert.equal(iconPicker.includes('onclick='), false)
