import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requiredLocales = ['en', 'de', 'es', 'zh-Hans', 'hi', 'ar']
const providerLocales = new Map([
  ['en', 'en'],
  ['de', 'de'],
  ['es', 'es'],
  ['zh-Hans', 'cn'],
  ['hi', 'hi'],
  ['ar', 'ar'],
])

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'))
}

function sha256(relativePath) {
  return createHash('sha256').update(readFileSync(path.join(repoRoot, relativePath))).digest('hex')
}

function pageRoutes(node, routes = new Set()) {
  if (typeof node === 'string') {
    routes.add(node)
    return routes
  }
  if (Array.isArray(node)) {
    for (const item of node) pageRoutes(item, routes)
    return routes
  }
  if (!node || typeof node !== 'object') return routes
  for (const key of ['pages', 'groups', 'tabs', 'languages']) {
    if (key in node) pageRoutes(node[key], routes)
  }
  if (typeof node.root === 'string') routes.add(node.root)
  return routes
}

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))
  return match?.[1]
}

export function checkLocalization() {
  const manifest = readJson('localization/manifest.json')
  const docs = readJson('docs.json')

  assert.equal(manifest.schemaVersion, 'kombify-public-docs-localization/v1')
  assert.equal(manifest.sourceLocale, 'en')
  assert.equal(manifest.fallbackLocale, 'en')
  assert.deepEqual(
    manifest.locales.map(({ locale }) => locale),
    requiredLocales,
    'localization manifest must preserve the initial locale contract and order',
  )

  const sourceHash = sha256(manifest.source.path)
  assert.equal(manifest.source.sha256, sourceHash, 'English source changed without refreshing translation candidates')

  const languages = docs.navigation?.languages
  assert.ok(Array.isArray(languages), 'docs.json must use native Mintlify language navigation')
  assert.deepEqual(
    languages.map(({ language }) => language),
    manifest.locales.map(({ providerLocale }) => providerLocale),
    'Mintlify language navigation must match the localization manifest',
  )

  const englishSource = readFileSync(path.join(repoRoot, manifest.source.path), 'utf8')
  const englishTitle = frontmatterValue(englishSource, 'title')
  const englishDescription = frontmatterValue(englishSource, 'description')
  const allRoutes = pageRoutes(docs.navigation)

  for (const [index, entry] of manifest.locales.entries()) {
    assert.equal(entry.providerLocale, providerLocales.get(entry.locale), `invalid Mintlify alias for ${entry.locale}`)
    assert.equal(entry.direction, entry.locale === 'ar' ? 'rtl' : 'ltr', `invalid text direction for ${entry.locale}`)
    assert.ok(existsSync(path.join(repoRoot, entry.path)), `missing localized page ${entry.path}`)
    assert.ok(allRoutes.has(entry.path.replace(/\.mdx$/, '')), `localized page ${entry.path} is absent from docs.json`)

    const language = languages[index]
    assert.ok(Array.isArray(language.tabs) && language.tabs.length > 0, `${entry.locale} has no navigable tabs`)
    assert.ok(
      Array.isArray(language.global?.anchors) && language.global.anchors.length > 0,
      `${entry.locale} has no localized global navigation`,
    )

    if (entry.locale === 'en') {
      assert.equal(entry.path, manifest.source.path)
      assert.equal(entry.reviewState, 'source')
      continue
    }

    assert.ok(
      language.navbar?.links?.some(({ label, href }) => label === 'EN' && href === '/'),
      `${entry.locale} has no direct English action`,
    )
    assert.equal(entry.sourceSha256, sourceHash, `${entry.locale} candidate is stale against the English source`)
    assert.equal(entry.reviewState, 'machine-assisted-candidate', `${entry.locale} must remain a review candidate`)
    const content = readFileSync(path.join(repoRoot, entry.path), 'utf8')
    assert.notEqual(frontmatterValue(content, 'title'), englishTitle, `${entry.locale} title still uses the English source`)
    assert.notEqual(
      frontmatterValue(content, 'description'),
      englishDescription,
      `${entry.locale} description still uses the English source`,
    )
  }

  process.stdout.write(
    `localization_contract: ok (${manifest.locales.length} locales, source sha256:${sourceHash})\n`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkLocalization()
}
