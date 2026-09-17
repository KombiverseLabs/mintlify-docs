import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { canonicalDigest, EVIDENCE_ASSET, syncRelease, validateCatalog, validateCompatibility, validateEvidence } from './sync-stackkits-release-docs.mjs'

function fixture(tag = 'v9.9.9') {
  const release = { tag, version: tag.slice(1), sourceSha: 'a'.repeat(40), publicSourceSha: 'b'.repeat(40), releaseUrl: `https://github.com/kombifyio/StackKits/releases/tag/${tag}` }
  const base = { release, generatedAt: '2026-08-13T00:00:00Z', generatorVersion: '9.9.9' }
  // v0.31.0 projects the authoring workload graph: kit cores and per-use-case
  // alternatives with module-local compute profiles (see validateAlternatives).
  const alternatives = [{ id: 'cloudreve', name: 'cloudreve', modules: [{ id: 'stackkits-cloudreve-runtime', computeProfiles: ['high', 'low', 'standard'] }] }]
  const kitCores = [{ id: 'basement-core', defaultAlternative: 'standalone-compose', alternatives: [
    { id: 'standalone', name: 'standalone', modules: [{ id: 'stackkits-basement-core-runtime', computeProfiles: ['high', 'standard'] }] },
    { id: 'standalone-compose', name: 'standalone-compose', modules: [{ id: 'stackkits-basement-core-lite-runtime', computeProfiles: ['high', 'low', 'standard'] }] },
  ] }]
  const catalog = { schemaVersion: 'stackkits-use-case-catalog/v1', ...base, catalog: { useCases: [{ id: 'files', title: 'Files', description: 'Private file storage.', components: [{ id: 'cloudreve', name: 'Cloudreve', role: 'primary', kind: 'application' }], defaultAlternative: 'cloudreve', alternatives }], kitCores }, contentDigest: '' }
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

// Published v0.24.60 metadata: choice/toggle/text defaults retain their JSON types.
function settings() {
  return [
    { id: 'accelerator', name: 'Accelerator', kind: 'choice', group: 'hardware', depth: 'summary', help: 'Choose hardware.', options: [{ id: 'cpu', name: 'CPU only' }, { id: 'nvidia', name: 'NVIDIA GPU', note: 'Requires a GPU' }], default: 'cpu', realization: 'recorded' },
    { id: 'ci-runners', name: 'CI runners', kind: 'toggle', group: 'features', depth: 'advanced', default: false, realization: 'install' },
    { id: 'mail-domain', name: 'Mail domain', kind: 'text', group: 'access', depth: 'summary', default: '', placeholder: 'example.com', realization: 'recorded' },
  ]
}

test('validates and renders only public release facts', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'stackkits-docs-'))
  const input = path.join(temp, 'input'), repo = path.join(temp, 'repo')
  const value = fixture()
  value.catalog.catalog.useCases[0].settings = settings()
  value.catalog.catalog.useCases[0].docs = '/guides/stackkits/use-cases/overview'
  value.catalog.contentDigest = canonicalDigest(value.catalog)
  // v0.24.63 projects the workload's declared default, not an observed install.
  value.compatibility.compatibility.applicationDelivery[0].defaultAlternativeRef = 'cloudreve'
  value.compatibility.compatibility.applicationDelivery[0].defaultModuleRef = 'cloudreve-runtime'
  value.compatibility.contentDigest = canonicalDigest(value.compatibility)
  writeFixture(input, value)
  const result = syncRelease({ repoRoot: repo, inputDir: input, tag: 'v9.9.9' })
  assert.equal(result.promoted, true)
  const page = readFileSync(path.join(repo, 'guides/stackkits/use-cases/overview.mdx'), 'utf8')
  assert.ok(page.includes(value.catalog.catalog.useCases[0].components[0].name))
  // This projection remains purpose/components only, not an installation UI
  // or a module graph: settings, kit cores and runtime modules are not rendered.
  assert.ok(!page.includes('Choose hardware.'))
  assert.ok(!page.includes('basement-core'))
  assert.ok(!page.includes('stackkits-cloudreve-runtime'))
})

test('rejects internal fields and positive OS claims without evidence', () => {
  const { catalog, compatibility } = fixture()
  catalog.catalog.useCases[0].gates = []
  catalog.contentDigest = canonicalDigest(catalog)
  assert.throws(() => validateCatalog(catalog, 'v9.9.9'), Error)
  compatibility.compatibility.os[0].status = 'supported'
  compatibility.contentDigest = canonicalDigest(compatibility)
  assert.throws(() => validateCompatibility(compatibility, 'v9.9.9', new Set(['files'])), Error)
  for (const mutate of [
    useCase => { useCase.settings = {} },
    useCase => { useCase.settings[0].gates = [] },
    useCase => { useCase.settings[0].options[0].secret = 'internal' },
    useCase => { useCase.settings[0].options = [] },
    useCase => { useCase.settings[0].kind = 'unknown' },
    useCase => { useCase.settings[0].group = 'unknown' },
    useCase => { useCase.settings[0].depth = 'unknown' },
    useCase => { useCase.settings[0].realization = 'supported' },
    useCase => { useCase.settings[1].default = 'false' },
    useCase => { useCase.settings[2].default = false },
    useCase => { useCase.docs = 'https://internal.example/' },
    useCase => { useCase.alternatives[0].modules[0].gates = [] },
    useCase => { useCase.defaultAlternative = 'not-declared' },
    (useCase, doc) => { doc.catalog.kitCores[0].alternatives[0].moduleRef = 'internal' },
    (useCase, doc) => { doc.catalog.kitCores[0].alternatives[0].modules[0].computeProfiles = [] },
  ]) {
    const broken = fixture().catalog
    const useCase = broken.catalog.useCases[0]
    useCase.settings = settings()
    mutate(useCase, broken)
    broken.contentDigest = canonicalDigest(broken)
    assert.throws(() => validateCatalog(broken, 'v9.9.9'), Error)
  }
  for (const field of ['defaultAlternativeRef', 'defaultModuleRef']) {
    for (const invalid of [false, '', 'Not-a-contract-id', '../internal']) {
      const broken = fixture().compatibility
      broken.compatibility.applicationDelivery[0][field] = invalid
      broken.contentDigest = canonicalDigest(broken)
      assert.throws(() => validateCompatibility(broken, 'v9.9.9', new Set(['files'])), Error)
    }
  }
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

// StackKits docs/data/os-compat/latest.json (schemas/os-compat-matrix.schema.json).
function evidence(stackkitsVersion = 'v9.9.9') {
  return {
    schemaVersion: 3,
    stackkitsVersion,
    generatedAt: '2026-09-16T12:04:02Z',
    results: [{ os: { family: 'linux', distribution: 'ubuntu', version: '24.04' }, architectures: ['amd64'], grade: 'supported', reasonCodes: [], verifiedPhases: ['install', 'restore'], lastVerifiedRelease: stackkitsVersion }],
    virtualization: [
      { id: 'covered-hypervisor', name: 'Covered Hypervisor', rollout: 'A guest VM is created through the hypervisor API.', grade: 'supported', reasonCodes: [], lastVerifiedRelease: stackkitsVersion },
      { id: 'untested-hypervisor', name: 'Untested Hypervisor', grade: 'unverified', reasonCodes: ['no-automated-lane'] },
    ],
    applications: [{ useCase: 'files', adapter: 'standalone-compose', grade: 'supported', reasonCodes: [], lastVerifiedRelease: stackkitsVersion }],
    environments: [
      { kit: 'basement-kit', environment: 'home-lan-vm', name: 'Virtual machine on a home network', grade: 'supported', reasonCodes: [], verifiedPhases: ['install', 'restore', 'lan-access'], lastVerifiedRelease: stackkitsVersion },
      { kit: 'cloud-kit', environment: 'public-vps', name: 'Public VPS', grade: 'unverified', reasonCodes: ['no-automated-lane'] },
    ],
  }
}

function syncWithEvidence(repo, dir, tag, document) {
  writeFixture(dir, fixture(tag))
  if (document) writeFileSync(path.join(dir, EVIDENCE_ASSET), `${JSON.stringify(document, null, 2)}\n`)
  const { promoted } = syncRelease({ repoRoot: repo, inputDir: dir, tag })
  return {
    promoted,
    os: readFileSync(path.join(repo, 'stackkits/reference/os-compatibility.mdx'), 'utf8'),
    delivery: readFileSync(path.join(repo, 'stackkits/reference/application-delivery-compatibility.mdx'), 'utf8'),
  }
}

function tempRepo() {
  const temp = mkdtempSync(path.join(tmpdir(), 'stackkits-docs-evidence-'))
  return { temp, repo: path.join(temp, 'repo') }
}

test('renders operating systems only from the lifecycle evidence document', () => {
  const { temp, repo } = tempRepo()
  const { os, delivery } = syncWithEvidence(repo, path.join(temp, 'input'), 'v9.9.9', evidence())

  assert.ok(os.includes('| Ubuntu | 24.04 | amd64 | `supported` |'))
  assert.ok(os.includes('| Basement Kit | Virtual machine on a home network | `supported` | All lifecycle phases passed; local service addresses answered from the home network |'))
  assert.ok(os.includes('| Cloud Kit | Public VPS | `unverified` |'))
  assert.ok(os.includes('releases/tag/v9.9.9'))
  assert.ok(!os.includes('receipt missing'), 'release manifest OS rows are not rendered')
  assert.ok(!os.includes('not projected yet'))
  assert.ok(!os.includes('Covered Hypervisor') && !os.includes('Untested Hypervisor'), 'hypervisor names stay off the docs page')
  assert.ok(delivery.includes('| yes | `supported` |'))
})

test('defines lifecycle grades with the wording shared by every compatibility surface', () => {
  const { temp, repo } = tempRepo()
  const { os, delivery } = syncWithEvidence(repo, path.join(temp, 'input'), 'v9.9.9', evidence())

  // Shared verbatim with stackkit.cc/compatibility and StackKits docs/OS_COMPATIBILITY.md.
  for (const page of [os, delivery]) {
    assert.ok(page.includes('- `supported`: Every lifecycle phase passed in the newest run on this release.'))
    assert.ok(page.includes('- `preview`: Install through verify passed in the newest run; a later phase failed.'))
    assert.ok(page.includes('- `unverified`: No completed run on this release yet, or the newest run failed before verify.'))
  }
  assert.ok(os.includes('Operating-system and hypervisor rows show the best result across the environments tested on this release; Kits by environment lists each environment on its own.'))
})

test('names the evidence release when it trails the synced tag', () => {
  const { temp, repo } = tempRepo()
  const { os, delivery } = syncWithEvidence(repo, path.join(temp, 'input'), 'v9.9.9', evidence('v9.9.8'))

  for (const page of [os, delivery]) {
    assert.ok(page.includes('Lifecycle runs for v9.9.9 are not projected yet; rows show v9.9.8, the newest projected release.'))
    assert.ok(page.includes('releases/tag/v9.9.8'))
  }
  assert.ok(os.includes('| Basement Kit | Virtual machine on a home network | `supported` |'))
  assert.ok(delivery.includes('| yes | `supported` |'))
})

test('stores evidence under its release, reuses it without an incoming asset and replaces it with an incoming one', () => {
  const { temp, repo } = tempRepo()
  syncWithEvidence(repo, path.join(temp, 'first'), 'v9.9.9', evidence('v9.9.8'))
  assert.equal(JSON.parse(readFileSync(path.join(repo, 'data/stackkits/releases/v9.9.8', EVIDENCE_ASSET), 'utf8')).stackkitsVersion, 'v9.9.8')

  let pages = syncWithEvidence(repo, path.join(temp, 'second'), 'v9.9.9', null)
  assert.ok(pages.os.includes('rows show v9.9.8'))
  assert.ok(pages.os.includes('| Basement Kit | Virtual machine on a home network | `supported` |'))

  const current = evidence('v9.9.9')
  current.environments[1] = { kit: 'cloud-kit', environment: 'public-vps', name: 'Public VPS', grade: 'supported', reasonCodes: [], lastVerifiedRelease: 'v9.9.9' }
  pages = syncWithEvidence(repo, path.join(temp, 'third'), 'v9.9.9', current)
  assert.ok(pages.os.includes('| Cloud Kit | Public VPS | `supported` |'))
  assert.ok(!pages.os.includes('not projected yet'))

  pages = syncWithEvidence(repo, path.join(temp, 'fourth'), 'v9.9.9', null)
  assert.ok(pages.os.includes('| Cloud Kit | Public VPS | `supported` |'))
  assert.ok(!pages.os.includes('not projected yet'))
})

test('keeps a newer stored projection when an older one arrives', () => {
  const { temp, repo } = tempRepo()
  syncWithEvidence(repo, path.join(temp, 'current'), 'v9.9.9', evidence('v9.9.9'))
  const older = evidence('v9.9.8')
  older.results[0] = { ...older.results[0], grade: 'unverified', reasonCodes: ['current-release-receipt-pending'], lastVerifiedRelease: undefined }
  const { os } = syncWithEvidence(repo, path.join(temp, 'replayed'), 'v9.9.9', older)

  assert.ok(os.includes('| Ubuntu | 24.04 | amd64 | `supported` |'))
  assert.ok(!os.includes('not projected yet'))
})

test('re-renders the latest pages when a sync for an older tag updates the projection they show', () => {
  const { temp, repo } = tempRepo()
  syncWithEvidence(repo, path.join(temp, 'latest'), 'v9.9.9', evidence('v9.9.8'))
  const updated = evidence('v9.9.8')
  updated.environments[1] = { kit: 'cloud-kit', environment: 'public-vps', name: 'Public VPS', grade: 'supported', reasonCodes: [], lastVerifiedRelease: 'v9.9.8' }
  const { promoted, os } = syncWithEvidence(repo, path.join(temp, 'older'), 'v9.9.8', updated)

  assert.equal(promoted, false)
  assert.equal(JSON.parse(readFileSync(path.join(repo, 'data/stackkits/latest.json'), 'utf8')).tag, 'v9.9.9')
  assert.ok(os.includes('| Cloud Kit | Public VPS | `supported` |'))
  assert.ok(os.includes('Lifecycle runs for v9.9.9 are not projected yet'))
})

test('rejects evidence bound to a release newer than the synced tag', () => {
  const { temp, repo } = tempRepo()
  assert.throws(() => syncWithEvidence(repo, path.join(temp, 'input'), 'v9.9.9', evidence('v9.9.10')), /newer/)
})

test('renders no operating-system table without lifecycle evidence', () => {
  const { temp, repo } = tempRepo()
  const { os, delivery } = syncWithEvidence(repo, path.join(temp, 'input'), 'v9.9.9', null)

  assert.ok(!os.includes('| Operating system |'))
  assert.ok(!os.includes('Ubuntu'))
  assert.ok(os.includes('https://stackkit.cc/compatibility'))
  assert.ok(delivery.includes('| Standalone Compose (`standalone-compose`) | `supported` |'))
})

test('accepts evidence identities that match the StackKits slug pattern', () => {
  const dotted = evidence()
  dotted.applications[0] = { ...dotted.applications[0], useCase: 'files.v2', adapter: 'standalone-compose.v2' }
  dotted.environments[0] = { ...dotted.environments[0], environment: 'home-lan.vm' }
  assert.equal(validateEvidence(dotted, 'v9.9.9'), dotted)
  for (const mutate of [
    doc => { doc.applications[0].useCase = 'Files' },
    doc => { doc.applications[0].adapter = '-compose' },
    doc => { doc.environments[0].environment = 'home_lan' },
  ]) {
    const broken = evidence()
    mutate(broken)
    assert.throws(() => validateEvidence(broken, 'v9.9.9'), Error)
  }
})
