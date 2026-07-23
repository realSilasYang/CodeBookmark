const path = require('node:path')
const { build, formatMessages } = require('esbuild')

async function main() {
  const root = path.resolve(__dirname, '..')
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.js',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    packages: 'external',
    sourcemap: true,
    sourcesContent: true,
    treeShaking: true,
    legalComments: 'none',
    logLevel: 'silent',
    metafile: true,
    banner: { js: '// CodeBookmark bundled runtime' },
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
