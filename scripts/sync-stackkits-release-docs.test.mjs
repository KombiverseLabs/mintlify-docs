import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { canonicalDigest, syncRelease, validateCatalog, validateCompatibility } from './sync-stackkits-release-docs.mjs'

function fixture(tag = 'v9.9.9') {
  const release = { tag, version: tag.slice(1), sourceSha: 'a'.repeat(40), publicSourceSha: 'b'.repeat(40), releaseUrl: `https://github.com/kombifyio/StackKits/releases/tag/${tag}` }
  const base = { release, generatedAt: '2026-08-13T00:00:00Z', generatorVersion: '9.9.9' }
  const catalog = { schemaVersion: 'stackkits-use-case-catalog/v1', ...base, catalog: { useCases: [{ id: 'files', title: 'Files', description: 'Private file storage.', components: [{ id: 'cloudreve', name: 'Cloudreve', role: 'primary', kind: 'application' }] }] }, contentDigest: '' }
  catalog.contentDigest = canonicalDigest(catalog)
  const compatibility = { schemaVersion: 'stackkits-compatibility/v1', ...base, compatibility: { os: [{ id: 'ubuntu-24.04', name: 'Ubuntu', version: '24.04', architecture: 'amd64/arm64', status: 'unverified', reason: 'receipt missing' }], applicationDelivery: [{ useCaseRef: 'files', workloadRef: 'files', adapterRef: 'standalone-compose', adapterName: 'Standalone Compose', status: 'supported', capabilities: { deployment: true, routeTLS: true, statusEvidence: true, backupRestore: true } }] }, contentDigest: '' }
  compatibility.contentDigest = canonicalDigest(compatibility)
  return { catalog, compatibility }
}

function writeFixture(root, value) {
  mkdirSync(root, { recursive: true })
  writeFileSync(path.join(root, 'stackkits-use-case-catalog-v1.json'), `${JSON.stringify(value.catalog, null, 2)}\n`)
  writeFileSync(path.join(root, 'stackkits-compatibility-v1.json'), `${JSON.stringify(value.compatibility, null, 2)}\n`)
}

test('validates and renders only public release facts', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'stackkits-docs-'))
  const input = path.join(temp, 'input'), repo = path.join(temp, 'repo')
  const value = fixture(); writeFixture(input, value)
  const result = syncRelease({ repoRoot: repo, inputDir: input, tag: 'v9.9.9' })
  assert.equal(result.promoted, true)
  const page = readFileSync(path.join(repo, 'guides/stackkits/use-cases/overview.mdx'), 'utf8')
  assert.match(page, /Cloudreve/)
  assert.doesNotMatch(page, /gap|maturity|progress/i)
})

test('rejects internal fields and positive OS claims without evidence', () => {
  const { catalog, compatibility } = fixture()
  catalog.catalog.useCases[0].gates = []
  catalog.contentDigest = canonicalDigest(catalog)
  assert.throws(() => validateCatalog(catalog, 'v9.9.9'), /unknown fields/)
  compatibility.compatibility.os[0].status = 'supported'
  compatibility.contentDigest = canonicalDigest(compatibility)
  assert.throws(() => validateCompatibility(compatibility, 'v9.9.9', new Set(['files'])), /requires release evidence/)
})

test('is idempotent and never downgrades latest', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'stackkits-docs-'))
  const input = path.join(temp, 'input'), oldInput = path.join(temp, 'old'), repo = path.join(temp, 'repo')
  writeFixture(input, fixture('v9.9.9'))
  syncRelease({ repoRoot: repo, inputDir: input, tag: 'v9.9.9' })
  syncRelease({ repoRoot: repo, inputDir: input, tag: 'v9.9.9' })
  writeFixture(oldInput, fixture('v9.9.8'))
  assert.equal(syncRelease({ repoRoot: repo, inputDir: oldInput, tag: 'v9.9.8' }).promoted, false)
  assert.equal(JSON.parse(readFileSync(path.join(repo, 'data/stackkits/latest.json'))).tag, 'v9.9.9')
})
