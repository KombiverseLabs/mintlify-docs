import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  keys(document.catalog, ['useCases'], 'catalog')
  if (!Array.isArray(document.catalog.useCases)) throw new Error('catalog.useCases must be an array')
  sortedUnique(document.catalog.useCases.map(item => item.id), 'catalog use-case IDs')
  for (const useCase of document.catalog.useCases) {
    keys(useCase, ['id', 'title', 'description', 'components'], `useCase ${useCase.id ?? '?'}`)
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
  }
  return document
}

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
    keys(row, ['useCaseRef', 'workloadRef', 'adapterRef', 'adapterName', 'status', 'capabilities'], 'application-delivery row')
    if (!useCaseIDs.has(row.useCaseRef)) throw new Error(`unknown useCaseRef ${row.useCaseRef}`)
    for (const field of ['useCaseRef', 'workloadRef', 'adapterRef', 'adapterName', 'status']) string(row[field], `applicationDelivery.${field}`)
    if (!['unsupported', 'supported', 'preview', 'beta'].includes(row.status)) throw new Error(`invalid delivery status ${row.status}`)
    keys(row.capabilities, ['deployment', 'routeTLS', 'statusEvidence', 'backupRestore'], 'delivery capabilities')
    for (const field of ['deployment', 'routeTLS', 'statusEvidence', 'backupRestore']) {
      if (typeof row.capabilities[field] !== 'boolean') throw new Error(`delivery capability ${field} must be boolean`)
    }
  }
  return document
}

function md(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('{', '&#123;').replaceAll('}', '&#125;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function provenance(title, description, icon, catalog) {
  return `---\ntitle: "${title}"\ndescription: "${description}"\nsidebarTitle: "${title}"\nicon: ${icon}\ngenerated: true\ngenerated_by: "${GENERATOR}"\ncontent_hash: "${catalog.contentDigest}"\nsource_hash: "${catalog.release.publicSourceSha}"\n---\n\n`
}

export function renderPages(catalog, compatibility) {
  const release = catalog.release
  let useCases = provenance('Use cases', `Components declared by StackKits ${release.tag}`, 'diagram-project', catalog)
  useCases += `This page is generated from the immutable [${release.tag} release](${release.releaseUrl}). It lists only the product purpose and components declared by that release.\n\n`
  for (const useCase of catalog.catalog.useCases) {
    useCases += `## ${md(useCase.title)}\n\n${md(useCase.description)}\n\n| Component | Role | Kind |\n| --- | --- | --- |\n`
    for (const component of useCase.components) useCases += `| ${md(component.name)} (\`${md(component.id)}\`) | ${md(component.role)} | ${md(component.kind)} |\n`
    useCases += '\n'
  }

  let os = provenance('OS compatibility', `Release-bound operating-system evidence for StackKits ${release.tag}`, 'server', compatibility)
  os += `Rows are generated from [${release.tag}](${release.releaseUrl}). \`unverified\` means no valid receipt for this release; it must not be read as support. \`unsupported\` is emitted only from policy.\n\n`
  os += '| Operating system | Version | Architecture | Status | Evidence or reason |\n| --- | --- | --- | --- | --- |\n'
  for (const row of compatibility.compatibility.os) {
    const evidence = row.evidenceRef ? `[receipt](${row.evidenceRef})` : md(row.reason || 'No release-bound receipt')
    os += `| ${md(row.name)} | ${md(row.version)} | ${md(row.architecture)} | \`${md(row.status)}\` | ${evidence} |\n`
  }

  let delivery = provenance('Application delivery compatibility', `Declared workload adapter capabilities in StackKits ${release.tag}`, 'route', compatibility)
  delivery += `This is the product capability declared by [${release.tag}](${release.releaseUrl}); it is not evidence that an adapter was deployed on a real host.\n\n`
  delivery += '| Use case | Workload | Adapter | Status | Deploy | Route/TLS | Status evidence | Backup/restore |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
  for (const row of compatibility.compatibility.applicationDelivery) {
    const yes = value => value ? 'yes' : 'no'
    delivery += `| \`${md(row.useCaseRef)}\` | \`${md(row.workloadRef)}\` | ${md(row.adapterName)} (\`${md(row.adapterRef)}\`) | \`${md(row.status)}\` | ${yes(row.capabilities.deployment)} | ${yes(row.capabilities.routeTLS)} | ${yes(row.capabilities.statusEvidence)} | ${yes(row.capabilities.backupRestore)} |\n`
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

export function syncRelease({ repoRoot, inputDir, tag }) {
  string(tag, 'tag', /^v\d+\.\d+\.\d+$/)
  const catalogBytes = readFileSync(path.join(inputDir, 'stackkits-use-case-catalog-v1.json'), 'utf8')
  const compatibilityBytes = readFileSync(path.join(inputDir, 'stackkits-compatibility-v1.json'), 'utf8')
  const catalog = validateCatalog(JSON.parse(catalogBytes), tag)
  const compatibility = validateCompatibility(JSON.parse(compatibilityBytes), tag, new Set(catalog.catalog.useCases.map(item => item.id)))
  if (JSON.stringify(catalog.release) !== JSON.stringify(compatibility.release)) throw new Error('catalog and compatibility release identity differ')
  if (catalog.generatedAt !== compatibility.generatedAt || catalog.generatorVersion !== compatibility.generatorVersion) throw new Error('manifest generator provenance differs')

  const snapshot = path.join(repoRoot, 'data', 'stackkits', 'releases', tag)
  for (const [name, bytes] of [['stackkits-use-case-catalog-v1.json', catalogBytes], ['stackkits-compatibility-v1.json', compatibilityBytes]]) {
    const target = path.join(snapshot, name)
    if (existsSync(target) && readFileSync(target, 'utf8') !== bytes) throw new Error(`immutable snapshot differs: ${target}`)
    writeExact(target, bytes)
  }

  const latestPath = path.join(repoRoot, 'data', 'stackkits', 'latest.json')
  const current = existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, 'utf8')) : null
  if (current?.tag === tag && (current.catalogDigest !== catalog.contentDigest || current.compatibilityDigest !== compatibility.contentDigest)) throw new Error(`latest ${tag} digest changed`)
  if (current && compareTags(tag, current.tag) < 0) return { promoted: false, catalog, compatibility }

  const latest = {
    schemaVersion: 'stackkits-docs-snapshot/v1', tag,
    catalogDigest: catalog.contentDigest, compatibilityDigest: compatibility.contentDigest,
    release: catalog.release, generatedAt: catalog.generatedAt, generatedBy: GENERATOR
  }
  writeExact(latestPath, `${JSON.stringify(latest, null, 2)}\n`)
  const pages = renderPages(catalog, compatibility)
  writeExact(path.join(repoRoot, 'guides', 'stackkits', 'use-cases', 'overview.mdx'), pages.useCases)
  writeExact(path.join(repoRoot, 'stackkits', 'reference', 'os-compatibility.mdx'), pages.os)
  writeExact(path.join(repoRoot, 'stackkits', 'reference', 'application-delivery-compatibility.mdx'), pages.delivery)
  return { promoted: true, catalog, compatibility }
}

function main() {
  const args = process.argv.slice(2)
  const value = name => args[args.indexOf(name) + 1]
  if (!args.includes('--write') || !value('--from-dir') || !value('--tag')) throw new Error('usage: node sync-stackkits-release-docs.mjs --from-dir <dir> --tag <vX.Y.Z> --write')
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const result = syncRelease({ repoRoot, inputDir: path.resolve(value('--from-dir')), tag: value('--tag') })
  process.stdout.write(`stackkits_docs_sync: ${result.promoted ? 'promoted' : 'stored'} ${result.catalog.release.tag}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
