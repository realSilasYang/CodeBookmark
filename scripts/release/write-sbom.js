const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const outputFile = process.argv[2]
if (!outputFile) {
  console.error('Usage: node scripts/release/write-sbom.js <output-file>')
  process.exit(1)
}

const bundledNpmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const npmCli = process.env.npm_execpath || (fs.existsSync(bundledNpmCli) ? bundledNpmCli : undefined)
const command = npmCli ? process.execPath : 'npm'
const content = execFileSync(command, [
  ...(npmCli ? [npmCli] : []),
  'sbom',
  '--omit=dev',
  '--package-lock-only',
  '--sbom-format=cyclonedx',
  '--sbom-type=application',
], {
  cwd: path.resolve(__dirname, '..', '..'),
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})
const sbom = JSON.parse(content)
if (sbom.bomFormat !== 'CycloneDX' || sbom.metadata?.component?.name !== 'CodeBookmark') {
  throw new Error('npm produced an unexpected SBOM document')
}
fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true })
fs.writeFileSync(outputFile, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8')
