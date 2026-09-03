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
  assert.ok(page.includes(value.catalog.catalog.useCases[0].components[0].name))
})

test('rejects internal fields and positive OS claims without evidence', () => {
  const { catalog, compatibility } = fixture()
  catalog.catalog.useCases[0].gates = []
  catalog.contentDigest = canonicalDigest(catalog)
  assert.throws(() => validateCatalog(catalog, 'v9.9.9'), Error)
  compatibility.compatibility.os[0].status = 'supported'
  compatibility.contentDigest = canonicalDigest(compatibility)
  assert.throws(() => validateCompatibility(compatibility, 'v9.9.9', new Set(['files'])), Error)
})

test('accepts the published compute-tier fit and still rejects a malformed one', () => {
  // StackKits publishes `computeTiers` on every use case since v0.22.0
  // (internal/usecasecatalog UseCase.ComputeTiers). The consumer rejected it as
  // an unknown field, so every release sync since then failed and the public
  // docs stayed pinned to an old tag.
  const { catalog } = fixture()
  catalog.catalog.useCases[0].computeTiers = {
    high: { included: true, functions: ['sync', 'share'], moduleSlug: 'cloudreve', load: { residency: 'always-on', baseline: 'low', burst: 'medium' } },
    low: { included: false, reason: 'Not part of the low graph.', notes: ['Revisit after SK-M5.'] },
    standard: { included: true },
  }
  catalog.contentDigest = canonicalDigest(catalog)
  assert.equal(validateCatalog(catalog, 'v9.9.9'), catalog)

  // The field is validated against its real shape, not allowlisted: an unknown
  // tier, an unknown fit key, or a non-boolean `included` must still fail.
  for (const mutate of [
    doc => { doc.catalog.useCases[0].computeTiers.gigantic = { included: true } },
    doc => { doc.catalog.useCases[0].computeTiers.standard.gates = [] },
    doc => { doc.catalog.useCases[0].computeTiers.standard.included = 'yes' },
    doc => { doc.catalog.useCases[0].computeTiers.high.load.residency = '' },
  ]) {
    const broken = structuredClone(catalog)
    mutate(broken)
    broken.contentDigest = canonicalDigest(broken)
    assert.throws(() => validateCatalog(broken, 'v9.9.9'), Error)
  }
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
