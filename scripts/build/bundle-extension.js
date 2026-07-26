/**
 * 使用 esbuild 把扩展运行时收束为单一 CommonJS 入口，同时保留 source map 供本地诊断。
 * 构建结束后核对模块数量与警告，防止遗漏入口或静默生成不完整的 VSIX。
 */
const path = require('node:path')
const { build, formatMessages } = require('esbuild')

async function main() {
  const root = path.resolve(__dirname, '../..')
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.js',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    sourcemap: true,
    sourcesContent: true,
    treeShaking: true,
    legalComments: 'none',
    logLevel: 'silent',
    metafile: true,
    banner: { js: '// CodeBookmark 运行时打包产物' },
  })
  if (result.warnings.length > 0) {
    const messages = await formatMessages(result.warnings, { kind: 'warning', color: false })
    throw new Error(`Extension bundling produced warnings:\n${messages.join('\n')}`)
  }
  console.log(`Bundled ${Object.keys(result.metafile.inputs).length} runtime modules into out/extension.js`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
