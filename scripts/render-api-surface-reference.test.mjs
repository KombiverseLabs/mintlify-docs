import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { syncReference } from './render-api-surface-reference.mjs'

const SHA = 'b'.repeat(40)
const OPENAPI = 'openapi: 3.1.0\ninfo:\n  title: Fixture\n  version: 1.0.0\npaths:\n  /api/v1/servers:\n    get: {}\n  /api/v1/servers/{id}:\n    delete: {}\n  /api/v1/secrets:\n    get: {}\n'

function operation(overrides) {
  return { method: 'GET', tags: ['Servers'], arguments: [], ...overrides }
}

const SURFACE = {
  schemaVersion: 'kombify.api-surface/v1',
  product: 'techstack',
  source: { path: 'api/openapi/techstack-v1.yaml', sha256: 'c'.repeat(64) },
  operations: [
    operation({ operationId: 'listServers', path: '/api/v1/servers', summary: 'List servers', cli: { command: ['servers', 'list'] }, mcp: { toolName: 'list_servers', requiredCapability: 'techstack.inventory.read', annotations: {} } }),
    operation({
      operationId: 'deleteServer',
      method: 'DELETE',
      path: '/api/v1/servers/{id}',
      summary: 'Delete a server',
      mutating: true,
      confirmation: 'This operation removes the server from the stack.',
      arguments: [{ name: 'id', in: 'path', wireName: 'id', required: true, schema: { type: 'string' } }],
      cli: { command: ['servers', 'delete'], args: ['id'] },
    }),
    operation({ operationId: 'revealSecret', path: '/api/v1/secrets', summary: 'Reveal a secret', tags: ['Secrets'], cli: { command: ['secrets', 'reveal'], hidden: true } }),
  ],
}

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'api-surface-reference-'))
  const docs = { navigation: { tabs: [{ tab: 'Techstack', groups: [{ group: 'Techstack', pages: ['techstack/overview'] }] }] } }
  writeFileSync(path.join(root, 'docs.json'), JSON.stringify(docs))
  return root
}

function sync(root, surface, openapi = OPENAPI, mode = 'write') {
  return syncReference({ repoRoot: root, product: 'techstack', surfaceBytes: Buffer.from(JSON.stringify(surface)), openapi, release: 'v1.2.3', sourceSha: SHA, mode })
}

test('a released surface becomes navigable CLI pages and an OpenAPI reference, without hidden commands', () => {
  const root = repo()
  try {
    const { files } = sync(root, SURFACE)
    const tab = JSON.parse(readFileSync(path.join(root, 'docs.json'), 'utf8')).navigation.tabs[0]
    const navigated = JSON.stringify(tab)
    const cliPages = files.filter((file) => file.endsWith('.mdx'))
    for (const file of cliPages) assert.ok(navigated.includes(`"${file.replace(/\.mdx$/, '')}"`), `${file} is not in the navigation`)
    const spec = files.find((file) => file.endsWith('.yaml'))
    assert.ok(navigated.includes(`"source":"${spec}"`))
    const written = files.map((file) => readFileSync(path.join(root, file), 'utf8'))
    for (const content of written) assert.match(content, new RegExp(`v1\\.2\\.3[\\s\\S]*${SHA}|${SHA}[\\s\\S]*v1\\.2\\.3`))
    const pages = cliPages.map((file) => readFileSync(path.join(root, file), 'utf8')).join('\n')
    assert.doesNotMatch(pages, /reveal/i)
    const deletePage = pages.slice(pages.indexOf('techstack api servers delete'))
    assert.match(deletePage.split('\n## ')[0], /removes the server from the stack[\s\S]*--yes/)
    assert.deepEqual(sync(root, SURFACE, OPENAPI, 'check').drift, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('artifacts that expose an internal operation are refused before anything is written', () => {
  const root = repo()
  try {
    const internal = structuredClone(SURFACE)
    internal.operations.push(operation({ operationId: 'drainWorker', path: '/api/v1/internal/workers/drain', cli: { command: ['workers', 'drain'] } }))
    assert.throws(() => sync(root, internal, `${OPENAPI}  /api/v1/internal/workers/drain:\n    post: {}\n`))
    assert.throws(() => sync(root, SURFACE, OPENAPI.replace('    delete: {}', '    delete:\n      x-kombify-internal: true')))
    assert.equal(readFileSync(path.join(root, 'docs.json'), 'utf8').includes('reference'), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the public boundary accepts LF and CRLF release stamps while refusing invalid provenance', () => {
  const root = repo()
  try {
    const { files } = sync(root, SURFACE)
    const originals = new Map(files.map(file => [file, readFileSync(path.join(root, file), 'utf8')]))
    const boundaryPages = {
      'overview.mdx': 'Techstack preview',
      'operating-modes.mdx': 'StackKits execution',
      'availability.mdx': 'Windows Alpha',
      'install-windows.mdx': 'https://github.com/kombifyio/TechStack releases/latest/download/kombify-Techstack-Setup.exe unsigned',
    }
    for (const [file, content] of Object.entries(boundaryPages)) writeFileSync(path.join(root, 'techstack', file), content)
    const scriptDirectory = path.join(root, 'scripts')
    mkdirSync(scriptDirectory)
    const checker = path.join(scriptDirectory, 'check-techstack-public-boundary.ps1')
    copyFileSync(new URL('./check-techstack-public-boundary.ps1', import.meta.url), checker)
    const powershell = process.platform === 'win32'
      ? 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
      : 'pwsh'
    const run = () => {
      const result = spawnSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', checker], {
        cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000,
      })
      assert.ifError(result.error)
      assert.equal(result.signal, null)
      assert.ok(result.status >= 0, `PowerShell initialization failed: ${result.status}`)
      return result
    }
    const restore = newline => {
      for (const [file, content] of originals) writeFileSync(path.join(root, file), content.replace(/\r?\n/g, newline))
    }
    for (const newline of ['\n', '\r\n']) {
      restore(newline)
      const result = run()
      assert.equal(result.status, 0, result.stdout + result.stderr)
    }
    const cli = files.find(file => file.endsWith('/servers.mdx'))
    for (const invalid of [
      content => content.replace(`source_hash: "${SHA}"`, 'source_hash: "not-a-commit"'),
      content => content.replace(/^generated_by:.*\r?\n/m, ''),
      content => content.replace('release: "v1.2.3"', 'release: "v9.8.7"'),
    ]) {
      restore('\r\n')
      writeFileSync(path.join(root, cli), invalid(readFileSync(path.join(root, cli), 'utf8')))
      assert.notEqual(run().status, 0, 'Invalid release provenance must remain denied')
    }
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('api-surface-reference-'))
    rmSync(root, { recursive: true, force: true })
  }
})
