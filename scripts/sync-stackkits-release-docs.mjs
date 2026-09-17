import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CATALOG_SCHEMA = 'stackkits-use-case-catalog/v1'
const COMPATIBILITY_SCHEMA = 'stackkits-compatibility/v1'
const GENERATOR = 'stackkit docs sync-release-manifests'

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
  }
  return value
}

export function canonicalDigest(document) {
  const clone = structuredClone(document)
  delete clone.contentDigest
  return `sha256:${createHash('sha256').update(JSON.stringify(normalize(clone)), 'utf8').digest('hex')}`
}

function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const unknown = Object.keys(value).filter(key => !allowed.includes(key))
  if (unknown.length) throw new Error(`${label} has unknown fields: ${unknown.join(', ')}`)
}

function string(value, label, pattern) {
  if (typeof value !== 'string' || value.length === 0 || (pattern && !pattern.test(value))) throw new Error(`${label} is invalid`)
}

function sortedUnique(values, label) {
  const sorted = [...values].sort()
  if (JSON.stringify(values) !== JSON.stringify(sorted)) throw new Error(`${label} must be sorted`)
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`)
}

function validateRelease(release, tag) {
  keys(release, ['tag', 'version', 'sourceSha', 'publicSourceSha', 'releaseUrl'], 'release')
  if (release.tag !== tag || release.version !== tag.slice(1)) throw new Error('release tag/version mismatch')
  string(release.sourceSha, 'release.sourceSha', /^[0-9a-f]{40}$/)
  string(release.publicSourceSha, 'release.publicSourceSha', /^[0-9a-f]{40}$/)
  if (release.releaseUrl !== `https://github.com/kombifyio/StackKits/releases/tag/${tag}`) throw new Error('release.releaseUrl mismatch')
}

function validateEnvelope(document, schema, tag) {
  keys(document, ['schemaVersion', 'release', 'generatedAt', 'generatorVersion', schema === CATALOG_SCHEMA ? 'catalog' : 'compatibility', 'contentDigest'], schema)
  if (document.schemaVersion !== schema) throw new Error(`expected ${schema}`)
  validateRelease(document.release, tag)
  string(document.generatedAt, 'generatedAt')
  if (Number.isNaN(Date.parse(document.generatedAt))) throw new Error('generatedAt is invalid')
  string(document.generatorVersion, 'generatorVersion')
  if (document.contentDigest !== canonicalDigest(document)) throw new Error(`${schema} contentDigest mismatch`)
}

export function validateCatalog(document, tag) {
  validateEnvelope(document, CATALOG_SCHEMA, tag)
  keys(document.catalog, ['useCases', 'kitCores'], 'catalog')
  if (!Array.isArray(document.catalog.useCases)) throw new Error('catalog.useCases must be an array')
  sortedUnique(document.catalog.useCases.map(item => item.id), 'catalog use-case IDs')
  for (const useCase of document.catalog.useCases) {
    keys(useCase, ['id', 'title', 'description', 'components', 'computeTiers', 'settings', 'docs', 'defaultAlternative', 'alternatives'], `useCase ${useCase.id ?? '?'}`)
    string(useCase.id, 'useCase.id', /^[a-z][a-z0-9-]+$/)
    string(useCase.title, `${useCase.id}.title`)
    string(useCase.description, `${useCase.id}.description`)
    if (!Array.isArray(useCase.components) || useCase.components.length === 0) throw new Error(`${useCase.id}.components must be non-empty`)
    sortedUnique(useCase.components.map(component => component.id), `${useCase.id} component IDs`)
    for (const component of useCase.components) {
      keys(component, ['id', 'name', 'role', 'kind'], `${useCase.id} component`)
      string(component.id, 'component.id', /^[a-z][a-z0-9-]+$/)
      string(component.name, 'component.name')
      if (!['primary', 'alternative', 'supporting', 'connector', 'bridge'].includes(component.role)) throw new Error(`invalid component role ${component.role}`)
      if (!['application', 'module', 'service', 'connector', 'bridge'].includes(component.kind)) throw new Error(`invalid component kind ${component.kind}`)
    }
    validateComputeTiers(useCase)
    validateSettings(useCase)
    if (useCase.docs !== undefined) string(useCase.docs, `${useCase.id}.docs`, /^\/[a-z0-9/-]+$/)
    if (useCase.defaultAlternative !== undefined || useCase.alternatives !== undefined) validateAlternatives(useCase, `useCase ${useCase.id}`)
  }
  validateKitCores(document.catalog.kitCores)
  return document
}

const CONTRACT_ID = /^[a-z][a-z0-9-]+$/

/**
 * StackKits v0.31.0 (internal/usecasecatalog AuthoringWorkload) projects the
 * authoring workload graph into the public catalog: `catalog.kitCores` lists
 * the service-kind workloads (kit cores), and every use case backed by a
 * workload carries its `defaultAlternative` and `alternatives`, whose modules
 * expose the module-local `computeProfiles` that replaced the computeTiers
 * axis. It is validated against the generator's invariants so the sync binds
 * to the real contract, but deliberately not rendered: the public pages stay
 * purpose/components only and publish no installation or module graph.
 */
function validateAlternatives(owner, label) {
  string(owner.defaultAlternative, `${label}.defaultAlternative`, CONTRACT_ID)
  if (!Array.isArray(owner.alternatives) || owner.alternatives.length === 0) throw new Error(`${label}.alternatives must be non-empty`)
  sortedUnique(owner.alternatives.map(alternative => alternative.id), `${label} alternative IDs`)
  for (const alternative of owner.alternatives) {
    keys(alternative, ['id', 'name', 'modules'], `${label}.alternatives`)
    string(alternative.id, `${label}.alternatives.id`, CONTRACT_ID)
    string(alternative.name, `${label}.alternatives.name`)
    if (!Array.isArray(alternative.modules) || alternative.modules.length === 0) throw new Error(`${label}.alternatives.modules must be non-empty`)
    for (const module of alternative.modules) {
      keys(module, ['id', 'computeProfiles'], `${label}.alternatives.modules`)
      string(module.id, `${label}.alternatives.modules.id`, CONTRACT_ID)
      if (!Array.isArray(module.computeProfiles) || module.computeProfiles.length === 0) throw new Error(`${label}.alternatives.modules.computeProfiles must be non-empty`)
      for (const profile of module.computeProfiles) string(profile, `${label}.alternatives.modules.computeProfiles entry`, CONTRACT_ID)
      sortedUnique(module.computeProfiles, `${label}.alternatives.modules.computeProfiles`)
    }
  }
  if (!owner.alternatives.some(alternative => alternative.id === owner.defaultAlternative)) throw new Error(`${label}.defaultAlternative is not a declared alternative`)
}

function validateKitCores(kitCores) {
  if (kitCores === undefined) return
  if (!Array.isArray(kitCores)) throw new Error('catalog.kitCores must be an array')
  sortedUnique(kitCores.map(core => core.id), 'catalog kit-core IDs')
  for (const core of kitCores) {
    keys(core, ['id', 'defaultAlternative', 'alternatives'], `kitCore ${core.id ?? '?'}`)
    string(core.id, 'kitCore.id', CONTRACT_ID)
    validateAlternatives(core, `kitCore ${core.id}`)
  }
}

// Public v0.24.60 foundation/use_case_catalog.cue and internal/usecasecatalog
// project this metadata. Validate it without expanding the purpose/components
// page into a settings UI or treating recorded intent as installation support.
function validateSettings(useCase) {
  if (useCase.settings === undefined) return
  const label = `${useCase.id}.settings`
  if (!Array.isArray(useCase.settings)) throw new Error(`${label} must be an array`)
  for (const setting of useCase.settings) {
    keys(setting, ['id', 'name', 'kind', 'group', 'depth', 'help', 'options', 'default', 'placeholder', 'realization'], label)
    string(setting.id, `${label}.id`, /^[a-z][a-z0-9-]+$/)
    string(setting.name, `${label}.name`)
    for (const [field, allowed] of [
      ['kind', ['choice', 'toggle', 'text']],
      ['group', ['backend', 'profile', 'storage', 'hardware', 'access', 'features']],
      ['depth', ['summary', 'advanced']],
      ['realization', ['install', 'recorded']],
    ]) {
      if (!allowed.includes(setting[field])) throw new Error(`${label}.${field} is invalid`)
    }
    if (setting.help !== undefined) string(setting.help, `${label}.help`)
    const defaultType = setting.kind === 'toggle' ? 'boolean' : 'string'
    if (typeof setting.default !== defaultType) throw new Error(`${label}.default must be ${defaultType}`)
    if (setting.kind === 'choice') {
      if (!Array.isArray(setting.options) || setting.options.length < 2) throw new Error(`${label}.options requires choices`)
      for (const option of setting.options) {
        keys(option, ['id', 'name', 'note'], `${label}.option`)
        string(option.id, `${label}.option.id`, /^[a-z][a-z0-9-]+$/)
        string(option.name, `${label}.option.name`)
        if (option.note !== undefined) string(option.note, `${label}.option.note`)
      }
    } else if (setting.options !== undefined) {
      throw new Error(`${label}.options requires choice kind`)
    }
    if (setting.placeholder !== undefined && (setting.kind !== 'text' || typeof setting.placeholder !== 'string')) {
      throw new Error(`${label}.placeholder requires text kind and string value`)
    }
  }
}

const COMPUTE_TIERS = ['high', 'low', 'standard']

/**
 * `computeTiers` is the Unifier-readable fit of a package on one
 * install.computeTier graph (StackKits internal/usecasecatalog UseCase). It is
 * validated here so the pipeline binds to the real contract rather than
 * allowlisting an opaque key, but it is deliberately not rendered: the axis was
 * superseded by module-local profiles on 2026-09-01, and public docs must not
 * publish a concept the product is retiring.
 */
function validateComputeTiers(useCase) {
  if (useCase.computeTiers === undefined) return
  const label = `${useCase.id}.computeTiers`
  keys(useCase.computeTiers, COMPUTE_TIERS, label)
  for (const [tier, fit] of Object.entries(useCase.computeTiers)) {
    keys(fit, ['included', 'functions', 'load', 'moduleSlug', 'reason', 'notes'], `${label}.${tier}`)
    if (typeof fit.included !== 'boolean') throw new Error(`${label}.${tier}.included must be a boolean`)
    if (fit.functions !== undefined) {
      if (!Array.isArray(fit.functions)) throw new Error(`${label}.${tier}.functions must be an array`)
      for (const entry of fit.functions) string(entry, `${label}.${tier}.functions entry`)
    }
    if (fit.notes !== undefined) {
      if (!Array.isArray(fit.notes)) throw new Error(`${label}.${tier}.notes must be an array`)
      for (const entry of fit.notes) string(entry, `${label}.${tier}.notes entry`)
    }
    if (fit.moduleSlug !== undefined) string(fit.moduleSlug, `${label}.${tier}.moduleSlug`, /^[a-z][a-z0-9-]+$/)
    if (fit.reason !== undefined) string(fit.reason, `${label}.${tier}.reason`)
    if (fit.load !== undefined) {
      keys(fit.load, ['residency', 'baseline', 'burst'], `${label}.${tier}.load`)
      for (const field of ['residency', 'baseline', 'burst']) string(fit.load[field], `${label}.${tier}.load.${field}`)
    }
  }
}

/**
 * `compatibility.os` stays validated so the sync binds to the release manifest
 * contract, but it is not rendered: operating-system rows come only from the
 * lifecycle evidence document (see renderPages), the single data basis every
 * StackKits compatibility surface shares.
 */
export function validateCompatibility(document, tag, useCaseIDs) {
  validateEnvelope(document, COMPATIBILITY_SCHEMA, tag)
  keys(document.compatibility, ['os', 'applicationDelivery'], 'compatibility')
  const os = document.compatibility.os
  const delivery = document.compatibility.applicationDelivery
  if (!Array.isArray(os) || !Array.isArray(delivery)) throw new Error('compatibility rows must be arrays')
  sortedUnique(os.map(row => row.id), 'OS IDs')
  for (const row of os) {
    keys(row, ['id', 'name', 'version', 'architecture', 'status', 'reason', 'evidenceRef'], `OS ${row.id ?? '?'}`)
    for (const field of ['id', 'name', 'version', 'architecture', 'status']) string(row[field], `OS ${row.id}.${field}`)
    if (!['unverified', 'unsupported', 'supported', 'preview'].includes(row.status)) throw new Error(`invalid OS status ${row.status}`)
    if (['supported', 'preview'].includes(row.status) && !/^https:\/\//.test(row.evidenceRef ?? '')) throw new Error(`positive OS row ${row.id} requires release evidence`)
    if (row.status === 'unsupported' && !row.reason) throw new Error(`unsupported OS row ${row.id} requires a policy reason`)
  }
  const deliveryKeys = delivery.map(row => `${row.useCaseRef}/${row.workloadRef}/${row.adapterRef}`)
  sortedUnique(deliveryKeys, 'application-delivery rows')
  for (const row of delivery) {
    keys(row, ['useCaseRef', 'workloadRef', 'adapterRef', 'adapterName', 'status', 'capabilities', 'defaultAlternativeRef', 'defaultModuleRef'], 'application-delivery row')
    if (!useCaseIDs.has(row.useCaseRef)) throw new Error(`unknown useCaseRef ${row.useCaseRef}`)
    for (const field of ['useCaseRef', 'workloadRef', 'adapterRef', 'adapterName', 'status']) string(row[field], `applicationDelivery.${field}`)
    // Public v0.24.63 projects optional #ContractID values from the workload
    // default and its module; they are catalog intent, not deployment evidence.
    for (const field of ['defaultAlternativeRef', 'defaultModuleRef']) {
      if (row[field] !== undefined) string(row[field], `applicationDelivery.${field}`, /^[a-z][a-z0-9-]*$/)
    }
    if (!['unsupported', 'supported', 'preview', 'beta'].includes(row.status)) throw new Error(`invalid delivery status ${row.status}`)
    keys(row.capabilities, ['deployment', 'routeTLS', 'statusEvidence', 'backupRestore'], 'delivery capabilities')
    for (const field of ['deployment', 'routeTLS', 'statusEvidence', 'backupRestore']) {
      if (typeof row.capabilities[field] !== 'boolean') throw new Error(`delivery capability ${field} must be boolean`)
    }
  }
  return document
}

// The lifecycle evidence projection (StackKits docs/data/os-compat/latest.json)
// is published as a mutable asset on the release its runs cover. Runs land
// after a release, so that release may be older than the synced tag.
export const EVIDENCE_ASSET = 'stackkits-compatibility-evidence-v3.json'
// StackKits schemas/os-compat-matrix.schema.json $defs/release and $defs/slug.
const EVIDENCE_RELEASE = /^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/
const EVIDENCE_SLUG = /^[a-z0-9][a-z0-9.-]*$/
const EVIDENCE_GRADES = ['supported', 'preview', 'unverified']
// Grade wording shared verbatim with stackkit.cc/compatibility and StackKits
// docs/OS_COMPATIBILITY.md.
const GRADE_MEANINGS = [
  ['supported', 'Every lifecycle phase passed in the newest run on this release.'],
  ['preview', 'Install through verify passed in the newest run; a later phase failed.'],
  ['unverified', 'No completed run on this release yet, or the newest run failed before verify.'],
]
const BEST_ENVIRONMENT = 'Operating-system and hypervisor rows show the best result across the environments tested on this release; Kits by environment lists each environment on its own.'
const EVIDENCE_REASONS = {
  'current-release-receipt-pending': 'No lifecycle receipt for this release yet',
  'no-automated-lane': 'Not covered by the automated lifecycle tests yet',
  'install-failed': 'Install phase failed on this release',
  'init-failed': 'Init phase failed on this release',
  'generate-failed': 'Generate phase failed on this release',
  'apply-failed': 'Apply phase failed on this release',
  'setup-failed': 'Application setup failed on this release',
  'verify-failed': 'Verify phase failed on this release',
  'backup-failed': 'Backup phase failed on this release',
  'restore-failed': 'Restore phase failed on this release',
  'lan-access-failed': 'Local service addresses were not reachable from the home network',
  'cleanup-failed': 'Cleanup after the lifecycle run failed',
}
const EVIDENCE_FIELDS = ['grade', 'reasonCodes', 'verifiedPhases', 'lastVerifiedRelease']
const EVIDENCE_KITS = { 'basement-kit': 'Basement Kit', 'cloud-kit': 'Cloud Kit', 'modern-homelab': 'Modern Homelab' }

function validateEvidenceRow(row, identity, label) {
  keys(row, [...identity, ...EVIDENCE_FIELDS], label)
  if (!EVIDENCE_GRADES.includes(row.grade)) throw new Error(`${label} has invalid grade ${row.grade}`)
  if (!Array.isArray(row.reasonCodes) || row.reasonCodes.some(code => !(code in EVIDENCE_REASONS))) throw new Error(`${label} has unknown reason codes`)
  if (row.grade === 'supported' ? row.reasonCodes.length !== 0 : row.reasonCodes.length === 0) throw new Error(`${label} reason codes do not match its grade`)
  for (const phase of row.verifiedPhases ?? []) string(phase, `${label}.verifiedPhases`, /^(install|init|generate|apply|verify|backup|restore|lan-access|setup-[a-z0-9-]+)$/)
  if (row.lastVerifiedRelease !== undefined) string(row.lastVerifiedRelease, `${label}.lastVerifiedRelease`, EVIDENCE_RELEASE)
}

/**
 * Accepts the projection of any release up to `tag`: stackkitsVersion names
 * the release the runs cover, which trails the newest release until its runs
 * land. A projection bound to a release newer than the synced tag is rejected.
 */
export function validateEvidence(document, tag) {
  keys(document, ['schemaVersion', 'stackkitsVersion', 'generatedAt', 'results', 'virtualization', 'applications', 'environments'], 'evidence')
  if (document.schemaVersion !== 3) throw new Error(`evidence schemaVersion=${document.schemaVersion}, want 3`)
  string(document.stackkitsVersion, 'evidence.stackkitsVersion', EVIDENCE_RELEASE)
  if (compareTags(document.stackkitsVersion, tag) > 0) throw new Error(`evidence is bound to ${document.stackkitsVersion}, newer than ${tag}`)
  string(document.generatedAt, 'evidence.generatedAt', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  for (const field of ['results', 'virtualization', 'applications']) {
    if (!Array.isArray(document[field])) throw new Error(`evidence.${field} must be an array`)
  }
  for (const row of document.results) {
    validateEvidenceRow(row, ['os', 'architectures'], 'evidence OS row')
    keys(row.os, ['family', 'distribution', 'version'], 'evidence OS identity')
    string(row.os.family, 'evidence OS family', EVIDENCE_SLUG)
    string(row.os.distribution, 'evidence OS distribution', EVIDENCE_SLUG)
    string(row.os.version, 'evidence OS version', /^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    for (const arch of row.architectures ?? []) string(arch, 'evidence OS architecture', /^(amd64|arm64)$/)
  }
  for (const row of document.virtualization) {
    validateEvidenceRow(row, ['id', 'name', 'rollout'], 'evidence hypervisor row')
    string(row.id, 'evidence hypervisor id', EVIDENCE_SLUG)
    string(row.name, 'evidence hypervisor name')
    if (row.rollout !== undefined) string(row.rollout, 'evidence hypervisor rollout', /^[^<>|\n]{1,240}$/)
  }
  for (const row of document.applications) {
    validateEvidenceRow(row, ['useCase', 'adapter'], 'evidence application row')
    string(row.useCase, 'evidence use case', EVIDENCE_SLUG)
    string(row.adapter, 'evidence adapter', EVIDENCE_SLUG)
  }
  if (document.environments !== undefined && !Array.isArray(document.environments)) throw new Error('evidence.environments must be an array')
  for (const row of document.environments ?? []) {
    validateEvidenceRow(row, ['kit', 'environment', 'name'], 'evidence environment row')
    if (!(row.kit in EVIDENCE_KITS)) throw new Error(`evidence environment row has unknown kit ${row.kit}`)
    string(row.environment, 'evidence environment id', EVIDENCE_SLUG)
    string(row.name, 'evidence environment name', /^[^<>|\n]{1,80}$/)
  }
  return document
}

function evidenceNote(row) {
  if (row.grade === 'supported' && row.verifiedPhases?.includes('lan-access')) return 'All lifecycle phases passed; local service addresses answered from the home network'
  if (row.grade === 'supported') return 'All lifecycle phases passed'
  return row.reasonCodes.map(code => EVIDENCE_REASONS[code]).join('; ')
}

function withoutLane(row) {
  return row.grade === 'unverified' && row.reasonCodes.includes('no-automated-lane')
}

function md(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('{', '&#123;').replaceAll('}', '&#125;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function provenance(title, description, icon, contentHash, sourceHash) {
  return `---\ntitle: "${title}"\ndescription: "${description}"\nsidebarTitle: "${title}"\nicon: ${icon}\ngenerated: true\ngenerated_by: "${GENERATOR}"\ncontent_hash: "${contentHash}"\nsource_hash: "${sourceHash}"\n---\n\n`
}

function releaseLink(tag) {
  return `[${tag}](https://github.com/kombifyio/StackKits/releases/tag/${tag})`
}

function gradeMeanings() {
  return GRADE_MEANINGS.map(([grade, meaning]) => `- \`${grade}\`: ${meaning}\n`).join('')
}

// Evidence trails the newest release until its lifecycle runs are projected;
// the pages name the release the rows show instead of re-grading them.
function pendingProjection(release, evidence) {
  if (evidence.stackkitsVersion === release.tag) return ''
  return `<Note>\nLifecycle runs for ${release.tag} are not projected yet; rows show ${evidence.stackkitsVersion}, the newest projected release.\n</Note>\n\n`
}

function renderOperatingSystems(release, compatibility, evidence) {
  if (!evidence) {
    let page = provenance('OS compatibility', 'Lifecycle evidence for StackKits operating systems', 'server', compatibility.contentDigest, release.publicSourceSha)
    page += 'Lifecycle evidence for StackKits is not published yet, so this page lists no operating systems. [stackkit.cc/compatibility](https://stackkit.cc/compatibility) shows the automated lifecycle runs as soon as they are projected. Run `stackkit compat` on a host for non-destructive diagnostics.\n'
    return page
  }
  let page = provenance('OS compatibility', `Lifecycle evidence for StackKits ${evidence.stackkitsVersion}`, 'server', canonicalDigest(evidence), release.publicSourceSha)
  page += pendingProjection(release, evidence)
  page += `Rows are projected from the automated lifecycle runs of StackKits ${releaseLink(evidence.stackkitsVersion)} on fresh virtual machines: install, init, generate, apply, verify, backup and restore. Last lifecycle run: ${evidence.generatedAt.slice(0, 10)}.\n\n`
  page += `${gradeMeanings()}\n${BEST_ENVIRONMENT}\n\n`
  page += '| Operating system | Version | Tested architecture | Status | Evidence | Last verified |\n| --- | --- | --- | --- | --- | --- |\n'
  for (const row of evidence.results) {
    const name = row.os.distribution.charAt(0).toUpperCase() + row.os.distribution.slice(1)
    page += `| ${md(name)} | ${md(row.os.version)} | ${md((row.architectures ?? []).join(', ') || '—')} | \`${md(row.grade)}\` | ${md(evidenceNote(row))} | ${md(row.lastVerifiedRelease ?? '—')} |\n`
  }
  page += '\nEach run installs the operating system fresh in a virtual machine.\n'
  const environments = evidence.environments ?? []
  if (environments.length) {
    page += '\n## Kits by environment\n\nEach kit is graded in the kind of environment it is built for. A home network run also opens the local service addresses from another machine on that network.\n\n'
    page += '| Kit | Environment | Status | Evidence | Last verified |\n| --- | --- | --- | --- | --- |\n'
    for (const row of environments) {
      page += `| ${md(EVIDENCE_KITS[row.kit])} | ${md(row.name)} | \`${md(row.grade)}\` | ${md(evidenceNote(row))} | ${md(row.lastVerifiedRelease ?? '—')} |\n`
    }
  }
  // The public-safety policy keeps hypervisor names off this site, so the page
  // points to stackkit.cc, which renders them from the same projection. The
  // stored projection under data/ keeps them and .mintignore keeps data/ unpublished.
  page += '\n## Hypervisors\n\nStackKits run inside a guest VM on your hypervisor, never on the hypervisor host itself. A status covers that rollout end to end: the guest is created on the hypervisor and the StackKit lifecycle runs inside it. It does not certify a vendor product or a server provider.\n\n'
  page += 'The hypervisor rollouts and their lifecycle evidence for this release are listed on [stackkit.cc/compatibility](https://stackkit.cc/compatibility). Run `stackkit compat` on a host for non-destructive diagnostics and the evidence published for its operating system and hypervisor.\n'
  return page
}

export function renderPages(catalog, compatibility, evidence = null) {
  const release = catalog.release
  let useCases = provenance('Use cases', `Components declared by StackKits ${release.tag}`, 'diagram-project', catalog.contentDigest, release.publicSourceSha)
  useCases += `This page is generated from the published [${release.tag} release](${release.releaseUrl}). It lists only the product purpose and components declared by that release.\n\n`
  for (const useCase of catalog.catalog.useCases) {
    useCases += `## ${md(useCase.title)}\n\n${md(useCase.description)}\n\n| Component | Role | Kind |\n| --- | --- | --- |\n`
    for (const component of useCase.components) useCases += `| ${md(component.name)} (\`${md(component.id)}\`) | ${md(component.role)} | ${md(component.kind)} |\n`
    useCases += '\n'
  }

  const os = renderOperatingSystems(release, compatibility, evidence)

  let delivery = provenance('Application delivery compatibility', `Declared workload adapter capabilities in StackKits ${release.tag}`, 'route', compatibility.contentDigest, release.publicSourceSha)
  const yes = value => value ? 'yes' : 'no'
  if (evidence) {
    delivery += pendingProjection(release, evidence)
    delivery += `Status and capabilities are declared by [${release.tag}](${release.releaseUrl}). The **Lifecycle test** column is projected from the automated lifecycle runs of StackKits ${releaseLink(evidence.stackkitsVersion)}:\n\n`
    delivery += gradeMeanings()
    delivery += '- `not tested`: No automated lifecycle run covers this use case on this adapter yet.\n\n'
    delivery += '| Use case | Workload | Adapter | Status | Deploy | Route/TLS | Status evidence | Backup/restore | Lifecycle test |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
  } else {
    delivery += `This is the product capability declared by [${release.tag}](${release.releaseUrl}); it is not evidence that an adapter was deployed on a real host.\n\n`
    delivery += '| Use case | Workload | Adapter | Status | Deploy | Route/TLS | Status evidence | Backup/restore |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n'
  }
  for (const row of compatibility.compatibility.applicationDelivery) {
    let line = `| \`${md(row.useCaseRef)}\` | \`${md(row.workloadRef)}\` | ${md(row.adapterName)} (\`${md(row.adapterRef)}\`) | \`${md(row.status)}\` | ${yes(row.capabilities.deployment)} | ${yes(row.capabilities.routeTLS)} | ${yes(row.capabilities.statusEvidence)} | ${yes(row.capabilities.backupRestore)} |`
    if (evidence) {
      const tested = evidence.applications.find(candidate => candidate.useCase === row.useCaseRef && candidate.adapter === row.adapterRef)
      let cell = 'not tested'
      if (tested && !withoutLane(tested)) {
        cell = `\`${md(tested.grade)}\``
        if (tested.grade !== 'supported') cell += ` ${md(evidenceNote(tested))}${tested.lastVerifiedRelease ? `; last verified ${md(tested.lastVerifiedRelease)}` : ''}`
      }
      line += ` ${cell} |`
    }
    delivery += `${line}\n`
  }
  return { useCases, os, delivery }
}

function version(tag) { return tag.slice(1).split('.').map(Number) }
function compareTags(a, b) {
  const av = version(a), bv = version(b)
  for (let index = 0; index < 3; index++) if (av[index] !== bv[index]) return av[index] - bv[index]
  return 0
}

function writeExact(target, content) {
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content)
}

// The newest stored projection not newer than `tag`. Each one lives under the
// release it is bound to, so a later sync without an incoming asset renders
// what the last handover delivered even when that release trails `tag`.
function storedEvidence(releases, tag) {
  if (!existsSync(releases)) return null
  const bound = readdirSync(releases)
    .filter(name => EVIDENCE_RELEASE.test(name) && compareTags(name, tag) <= 0 && existsSync(path.join(releases, name, EVIDENCE_ASSET)))
    .sort(compareTags)
    .at(-1)
  if (!bound) return null
  const document = validateEvidence(JSON.parse(readFileSync(path.join(releases, bound, EVIDENCE_ASSET), 'utf8')), tag)
  if (document.stackkitsVersion !== bound) throw new Error(`stored evidence under ${bound} is bound to ${document.stackkitsVersion}`)
  return document
}

const CATALOG_ASSET = 'stackkits-use-case-catalog-v1.json'
const COMPATIBILITY_ASSET = 'stackkits-compatibility-v1.json'

// Reads and validates the immutable release manifests in `dir`: a release
// download or a stored snapshot under data/stackkits/releases/<tag>.
function readManifests(dir, tag) {
  const catalogBytes = readFileSync(path.join(dir, CATALOG_ASSET), 'utf8')
  const compatibilityBytes = readFileSync(path.join(dir, COMPATIBILITY_ASSET), 'utf8')
  const catalog = validateCatalog(JSON.parse(catalogBytes), tag)
  const compatibility = validateCompatibility(JSON.parse(compatibilityBytes), tag, new Set(catalog.catalog.useCases.map(item => item.id)))
  if (JSON.stringify(catalog.release) !== JSON.stringify(compatibility.release)) throw new Error('catalog and compatibility release identity differ')
  if (catalog.generatedAt !== compatibility.generatedAt || catalog.generatorVersion !== compatibility.generatorVersion) throw new Error('manifest generator provenance differs')
  return { catalogBytes, compatibilityBytes, catalog, compatibility }
}

export function syncRelease({ repoRoot, inputDir, tag }) {
  string(tag, 'tag', /^v\d+\.\d+\.\d+$/)
  const synced = readManifests(inputDir, tag)
  const incomingPath = path.join(inputDir, EVIDENCE_ASSET)
  const incomingBytes = existsSync(incomingPath) ? readFileSync(incomingPath, 'utf8') : null
  const incoming = incomingBytes ? validateEvidence(JSON.parse(incomingBytes), tag) : null

  const releases = path.join(repoRoot, 'data', 'stackkits', 'releases')
  for (const [name, bytes] of [[CATALOG_ASSET, synced.catalogBytes], [COMPATIBILITY_ASSET, synced.compatibilityBytes]]) {
    const target = path.join(releases, tag, name)
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) throw new Error(`immutable snapshot differs: ${target}`)
    writeExact(target, bytes)
  }
  // Evidence is mutable: the incoming projection is the one StackKits publishes
  // now for its release, so it replaces the stored document of that release.
  if (incoming) writeExact(path.join(releases, incoming.stackkitsVersion, EVIDENCE_ASSET), incomingBytes)

  const latestPath = path.join(repoRoot, 'data', 'stackkits', 'latest.json')
  const current = existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, 'utf8')) : null
  const promoted = !current || compareTags(tag, current.tag) >= 0
  const shown = promoted ? synced : readManifests(path.join(releases, current.tag), current.tag)
  if (current && current.tag === shown.catalog.release.tag && (current.catalogDigest !== shown.catalog.contentDigest || current.compatibilityDigest !== shown.compatibility.contentDigest)) {
    throw new Error(`latest ${current.tag} digest changed`)
  }
  if (promoted) {
    const latest = {
      schemaVersion: 'stackkits-docs-snapshot/v1', tag,
      catalogDigest: synced.catalog.contentDigest, compatibilityDigest: synced.compatibility.contentDigest,
      release: synced.catalog.release, generatedAt: synced.catalog.generatedAt, generatedBy: GENERATOR
    }
    writeExact(latestPath, `${JSON.stringify(latest, null, 2)}\n`)
  }

  // The pages always show the latest release with the newest stored projection
  // not newer than it. Rendering from the store, not from the incoming asset,
  // means a sync for an older tag that updates that projection re-renders the
  // pages, and an older incoming projection never displaces a newer stored one.
  const evidence = storedEvidence(releases, shown.catalog.release.tag)
  const pages = renderPages(shown.catalog, shown.compatibility, evidence)
  writeExact(path.join(repoRoot, 'guides', 'stackkits', 'use-cases', 'overview.mdx'), pages.useCases)
  writeExact(path.join(repoRoot, 'stackkits', 'reference', 'os-compatibility.mdx'), pages.os)
  writeExact(path.join(repoRoot, 'stackkits', 'reference', 'application-delivery-compatibility.mdx'), pages.delivery)
  return { promoted, catalog: synced.catalog, compatibility: synced.compatibility, shownTag: shown.catalog.release.tag, evidence }
}

function main() {
  const args = process.argv.slice(2)
  const value = name => args[args.indexOf(name) + 1]
  if (!args.includes('--write') || !value('--from-dir') || !value('--tag')) throw new Error('usage: node sync-stackkits-release-docs.mjs --from-dir <dir> --tag <vX.Y.Z> --write')
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const result = syncRelease({ repoRoot, inputDir: path.resolve(value('--from-dir')), tag: value('--tag') })
  process.stdout.write(`stackkits_docs_sync: ${result.promoted ? 'promoted' : 'stored'} ${result.catalog.release.tag}; pages show ${result.shownTag}, lifecycle evidence ${result.evidence?.stackkitsVersion ?? 'not published'}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
