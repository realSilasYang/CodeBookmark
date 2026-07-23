/**
 * 模块说明：本文件负责扩展构建与产物生成，具体对象为 `bundle-extension`。
 *
 * 实现要点：从源码与稳定清单生成可发布产物，并在覆盖目标前完成确定性整理。
 * 核心边界：生成结果必须确定、可复现，并与源码清单及发布校验保持一致。
 * 主要入口：`main`。
 * 维护约束：注释只解释意图与约束；修改实现后必须同步更新相应契约测试和验证脚本。
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
    packages: 'external',
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
