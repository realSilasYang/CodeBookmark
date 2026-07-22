const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs/promises')
const { pathToFileURL } = require('node:url')
const { runTests } = require('@vscode/test-electron')

async function main() {
  const root = path.resolve(__dirname, '..')
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codebookmark-integration-'))
  const fixturePath = path.join(tempRoot, 'workspace')
  const userDataPath = path.join(tempRoot, 'user-data')
  const fixtureUri = pathToFileURL(fixturePath).href
  await fs.mkdir(fixturePath, { recursive: true })
  await fs.mkdir(path.join(userDataPath, 'User'), { recursive: true })
  await fs.copyFile(
    path.join(root, 'integration-tests', 'fixture', 'sample.ts'),
    path.join(fixturePath, 'sample.ts'),
  )
  // Commands launched from a VS Code extension host inherit this flag. Electron
  // would then treat the workspace argument as a Node.js entry module.
  const inheritedElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE
  delete process.env.ELECTRON_RUN_AS_NODE
  try {
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(root, 'integration-tests', 'suite', 'index.js'),
      launchArgs: [`--user-data-dir=${userDataPath}`, `--folder-uri=${fixtureUri}`],
    })
  } finally {
    if (inheritedElectronRunAsNode === undefined) delete process.env.ELECTRON_RUN_AS_NODE
    else process.env.ELECTRON_RUN_AS_NODE = inheritedElectronRunAsNode
    await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
