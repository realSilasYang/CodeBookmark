const fs = require('fs')
const path = require('path')
const https = require('https')

const iconsDir = path.join(__dirname, '..', '..', 'resources', 'custom_icons')
const listPath = path.join(__dirname, 'curated_icons.json')
const CONCURRENCY_LIMIT = 20
const REQUEST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 5
const ICON_NAME_PATTERN = /^(status|arch|ui|fun|brand)_[a-z0-9][a-z0-9_-]*\.svg$/

function fail(message) {
  throw new Error(message)
}

function validateItem(value) {
  if (!value || typeof value !== 'object') fail('curated icon entry must be an object')
  if (typeof value.name !== 'string' || !ICON_NAME_PATTERN.test(value.name)) {
    fail(`invalid curated icon filename: ${String(value.name)}`)
  }
  let url
  try {
    url = new URL(value.url)
  } catch {
    fail(`invalid URL for ${value.name}`)
  }
  if (url.protocol !== 'https:') fail(`icon URL must use HTTPS: ${value.name}`)
  return { name: value.name, url: url.toString() }
}

function fetchSvg(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { 'User-Agent': 'CodeBookmark icon asset builder' },
    }, response => {
      const status = response.statusCode || 0
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume()
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error(`too many redirects for ${url}`))
          return
        }
        let redirected
        try {
          redirected = new URL(response.headers.location, url)
        } catch {
          reject(new Error(`invalid redirect for ${url}`))
          return
        }
        if (redirected.protocol !== 'https:') {
          reject(new Error(`redirect downgraded from HTTPS: ${redirected}`))
          return
        }
        fetchSvg(redirected.toString(), redirects + 1).then(resolve, reject)
        return
      }

      if (status !== 200) {
        response.resume()
        reject(new Error(`HTTP ${status}`))
        return
      }

      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(new Error(`response exceeds ${MAX_RESPONSE_BYTES} bytes`))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      response.on('error', reject)
    })
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error(`request timed out after ${REQUEST_TIMEOUT_MS} ms`)))
    request.on('error', reject)
  })
}

function validateSvg(content, name) {
  if (!/<svg(?:\s|>)/i.test(content)) fail(`${name}: response is not SVG`)
  if (/<script(?:\s|>)|<foreignObject(?:\s|>)|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["'](?:javascript:|data:|https?:)/i.test(content)) {
    fail(`${name}: SVG contains active or external content`)
  }
}

async function writeIcon(item) {
  const content = await fetchSvg(item.url)
  validateSvg(content, item.name)
  const targetPath = path.join(iconsDir, item.name)
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`
  try {
    await fs.promises.writeFile(temporaryPath, content, 'utf8')
    await fs.promises.rename(temporaryPath, targetPath)
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function main() {
  if (!fs.existsSync(listPath)) fail('curated_icons.json not found; run build-curated-list.js first')
  const parsed = JSON.parse(await fs.promises.readFile(listPath, 'utf8'))
  if (!parsed || !Array.isArray(parsed.icons)) fail('curated_icons.json must contain an icons array')
  const iconList = parsed.icons.map(validateItem)
  const duplicateNames = iconList.filter((item, index) => iconList.findIndex(other => other.name === item.name) !== index)
  if (duplicateNames.length > 0) fail(`duplicate icon names: ${[...new Set(duplicateNames.map(item => item.name))].join(', ')}`)

  await fs.promises.mkdir(iconsDir, { recursive: true })
  console.log(`Downloading ${iconList.length} categorized icons with concurrency ${CONCURRENCY_LIMIT}...`)

  let nextIndex = 0
  let completed = 0
  const failures = []
  const worker = async () => {
    while (nextIndex < iconList.length) {
      const item = iconList[nextIndex++]
      try {
        await writeIcon(item)
        completed++
      } catch (error) {
        failures.push({ name: item.name, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  const workerCount = Math.min(CONCURRENCY_LIMIT, iconList.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  for (const failure of failures) console.error(`Failed: ${failure.name} (${failure.error})`)
  console.log(`Finished downloading. Success: ${completed}, Failed: ${failures.length}`)
  if (failures.length > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
