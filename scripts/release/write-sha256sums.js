const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const [outputFile, ...inputFiles] = process.argv.slice(2)
if (!outputFile || inputFiles.length === 0) {
  console.error('Usage: node scripts/release/write-sha256sums.js <output-file> <artifact> [...]')
  process.exit(1)
}

const names = new Set()
const lines = inputFiles.map(file => {
  const name = path.basename(file)
  if (names.has(name)) throw new Error(`Duplicate artifact name: ${name}`)
  names.add(name)
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  return `${digest}  ${name}`
})
fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true })
fs.writeFileSync(outputFile, `${lines.join('\n')}\n`, 'utf8')
