// Renders a product's API reference and generated-CLI reference from the two
// public artifacts of one published release (API-FIRST-STANDARD.md §9):
// `openapi.public.yaml` is copied into the docs tree for Mintlify's OpenAPI
// navigation, and `api-surface.json` (kombify.api-surface/v1) becomes the
// `<binary> api` command pages. Pages are generated, never hand-edited.
//
// Usage: node scripts/render-api-surface-reference.mjs --product techstack \
//   --surface <api-surface.json> --openapi <openapi.public.yaml> \
//   --release <tag> --source-sha <sha> (--write | --check)
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cell, code, text, yamlString } from './render-stackkits-cli-reference.mjs'

export const GENERATOR = 'render-api-surface-reference'
const SCHEMA = 'kombify.api-surface/v1'

// Product runtime facts that live in the product binary, not in the surface:
// where `<binary> api` sends requests and which credentials it reads.
export const PRODUCTS = {
  techstack: {
    name: 'Techstack',
    tab: 'Techstack',
    binary: 'techstack',
    referenceDir: 'techstack/reference',
    environment: [
      ['TECHSTACK_API_URL', 'API base URL. Defaults to `https://api.kombify.io/v1/techstack`; set it to the address of your own Techstack instance to call that instance directly.'],
      ['TECHSTACK_API_TOKEN', 'Bearer token sent with every request. Without it the CLI uses the session stored by `techstack login`, and fails with exit code 3 when there is none or it has expired.'],
    ],
  },
}

// The generated CLI runtime contract (kombify-go-common apisurface/cli).
const UNIVERSAL_OPTIONS = [
  ['--fields <paths>', 'every command', 'Comma-separated dotted paths to keep in the output; applied per element for arrays.'],
  ['--ndjson', 'every command', 'Print arrays as one compact JSON value per line.'],
  ['--dry-run', 'mutating commands', 'Print the resolved request as JSON without authorizing or sending it.'],
  ['--idempotency-key <key>', 'mutating commands', 'Idempotency-Key header; defaults to a fresh UUID.'],
  ['--body <json|@path|->', 'commands with a JSON body', 'Base request body as a literal, a file or stdin; argument flags override its properties.'],
  ['--file <path|->', 'commands with a file body', 'Request body file sent with the declared content type.'],
  ['--yes', 'commands that need confirmation', 'Confirm without a prompt; required when not interactive.'],
]
const EXIT_CODES = [
  [0, 'Success.'],
  [1, 'Any other failure.'],
  [2, 'Invalid input (HTTP 400/422).'],
  [3, 'Not authenticated (HTTP 401).'],
  [4, 'Denied, payment required or rate limited (HTTP 402/403/429).'],
  [5, 'Not found (HTTP 404).'],
  [6, 'Conflict (HTTP 409).'],
  [7, 'Server or transport failure (HTTP 5xx).'],
  [9, 'Confirmation required or declined.'],
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function internalPath(value) {
  return /(^|\/)internal(\/|$)/i.test(value)
}

// Path keys of the OpenAPI `paths` map, read from the YAML text without a
// parser: two-space-indented keys directly below a top-level `paths:`.
export function openApiPaths(yaml) {
  const lines = yaml.split(/\r?\n/)
  const start = lines.findIndex((line) => /^paths:\s*$/.test(line))
  assert(start >= 0, 'OpenAPI document has no top-level paths map')
  const paths = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && !line.startsWith('#')) break
    const match = /^ {2}(['"]?)(\/[^'"]*?)\1:\s*$/.exec(line)
    if (match) paths.push(match[2])
  }
  return paths
}

// A path item that only `$ref`s another path item is an alias with no
// operation of its own (API-FIRST-STANDARD.md §9.2). Mintlify rejects such
// path items, so the rendered reference documents each operation once, under
// its canonical path.
export function withoutAliasPaths(yaml) {
  const lines = yaml.split('\n')
  const start = lines.findIndex((line) => /^paths:\s*$/.test(line))
  const out = lines.slice(0, start + 1)
  let index = start + 1
  while (index < lines.length && !(/^\S/.test(lines[index]) && !lines[index].startsWith('#'))) {
    let end = index + 1
    while (end < lines.length && !/^ {0,2}\S/.test(lines[end])) end += 1
    const body = lines.slice(index + 1, end).filter((line) => line.trim() && !line.trim().startsWith('#'))
    const alias = /^ {2}\S/.test(lines[index]) && body.length === 1 && /^ {4}['"]?\$ref['"]?\s*:/.test(body[0])
    if (!alias) out.push(...lines.slice(index, end))
    index = end
  }
  return [...out, ...lines.slice(index)].join('\n')
}

// Published artifacts carry no internal operation and no x-kombify-*
// annotation (API-FIRST-STANDARD.md §9.1); anything else is refused, never
// filtered, because it means the release published the wrong artifact.
export function validateArtifacts({ surface, openapi, product }) {
  assert(PRODUCTS[product], `unknown product ${product}`)
  assert(surface?.schemaVersion === SCHEMA, `api-surface schemaVersion must be ${SCHEMA}`)
  assert(surface.product === product, `api-surface product must be ${product}`)
  assert(Array.isArray(surface.operations) && surface.operations.length > 0, 'api-surface needs operations')
  assert(/^openapi:\s*['"]?3\.1\./m.test(openapi), 'public OpenAPI document must be OpenAPI 3.1')
  assert(!/^\s*(?:-\s+)?['"]?x-kombify-[a-z-]+['"]?\s*:/m.test(openapi), 'public OpenAPI document must not carry x-kombify-* annotations')
  const published = new Set(openApiPaths(openapi))
  for (const route of published) assert(!internalPath(route), `public OpenAPI document exposes internal path ${route}`)
  const ids = new Set()
  const commands = new Set()
  for (const op of surface.operations) {
    assert(op.operationId && !ids.has(op.operationId), `duplicate or missing operationId ${op.operationId}`)
    ids.add(op.operationId)
    assert(!Object.keys(op).some((key) => key.startsWith('x-kombify')) && !internalPath(op.path), `api-surface exposes internal operation ${op.operationId}`)
    assert(published.has(op.path), `${op.operationId} path ${op.path} is missing from the public OpenAPI document`)
    const words = op.cli?.command
    assert(Array.isArray(words) && words.length > 0 && words.every((word) => /^[a-z0-9][a-z0-9-]*$/.test(word)), `${op.operationId} has an invalid CLI command`)
    assert(!commands.has(words.join(' ')), `duplicate CLI command ${words.join(' ')}`)
    commands.add(words.join(' '))
  }
  return surface
}

const kebab = (name) => name.replaceAll('_', '-')

function schemaType(schema = {}) {
  const types = Array.isArray(schema.type) ? schema.type.filter((type) => type !== 'null') : [schema.type]
  const type = types[0] ?? 'string'
  if (type === 'array') return `${schemaType(schema.items)}[]`
  return type
}

function argumentNotes(argument) {
  const schema = argument.schema ?? {}
  const notes = []
  if (argument.required) notes.push('**Required.**')
  if (argument.description) notes.push(cell(argument.description.trim().replace(/\.?$/, '.')))
  if (Array.isArray(schema.enum)) notes.push(`One of ${schema.enum.map((value) => code(value)).join(', ')}.`)
  if (schema.default !== undefined && !/\bdefault\b/i.test(argument.description ?? '')) notes.push(`Default ${code(JSON.stringify(schema.default))}.`)
  return notes.join(' ') || '—'
}

function commandPath(product, op) {
  return [PRODUCTS[product].binary, 'api', ...op.cli.command].join(' ')
}

function renderCommand(product, op) {
  const positional = (op.cli.args ?? []).map((name) => (op.arguments ?? []).find((argument) => argument.name === name)).filter(Boolean)
  const wholeBody = (argument) => argument.in === 'body' && !argument.wireName
  const flagged = (op.arguments ?? []).filter((argument) => !positional.includes(argument) && !wholeBody(argument))
  const title = commandPath(product, op)
  const usage = [title, ...positional.map((argument) => `<${kebab(argument.name)}>`), '[flags]'].join(' ')
  const lines = [`## ${title}`, '']
  if (op.summary) lines.push(`${text(op.summary.trim().replace(/\.?$/, '.'))}`, '')
  if (op.deprecated) lines.push('<Warning>Deprecated. The operation still runs but is scheduled for removal.</Warning>', '')
  if (op.description) lines.push(text(op.description.trim()), '')
  lines.push('```bash', usage, '```', '')
  if (op.confirmation) {
    lines.push(`<Warning>Requires confirmation: ${text(op.confirmation)} Pass \`--yes\` or answer the prompt; a non-interactive run without \`--yes\` stops before any request with exit code 9.</Warning>`, '')
  }
  const facts = [
    ['HTTP', code(`${op.method} ${op.path}`)],
    ['Changes state', op.mutating ? 'Yes' : 'No'],
    ...(op.availability ? [['Availability', text(op.availability)]] : []),
    ...(op.cli.aliases?.length ? [['Aliases', op.cli.aliases.map((alias) => code(alias)).join(', ')]] : []),
    ['MCP tool', op.mcp ? code(op.mcp.toolName) : 'None'],
  ]
  lines.push('| | |', '| --- | --- |', ...facts.map(([key, value]) => `| ${key} | ${value} |`), '')
  const rows = [
    ...positional.map((argument) => `| ${code(`<${kebab(argument.name)}>`)} | ${cell(schemaType(argument.schema))} | ${argumentNotes({ ...argument, required: true })} |`),
    ...flagged.map((argument) => `| ${code(`--${kebab(argument.name)}`)} | ${cell(schemaType(argument.schema))} | ${argumentNotes(argument)} |`),
  ]
  if (op.body) {
    const flag = op.body.mode === 'file' ? '--file' : '--body'
    const about = op.body.mode === 'file' ? `Request body file (${code(op.body.contentType)}); ${code('-')} reads stdin.` : `JSON request body (${code(op.body.contentType)}) as a literal, ${code('@path')} or ${code('-')} for stdin.`
    rows.push(`| ${code(flag)} | ${op.body.mode === 'file' ? 'file' : 'json'} | ${op.body.required && op.body.mode !== 'properties' ? '**Required.** ' : ''}${about} |`)
  }
  if (rows.length) lines.push('| Argument | Type | Description |', '| --- | --- | --- |', ...rows, '')
  return lines.join('\n')
}

function frontmatter({ title, description, sidebarTitle, icon, release, contentHash, sourceSha }) {
  return [
    '---',
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    ...(sidebarTitle ? [`sidebarTitle: ${yamlString(sidebarTitle)}`] : []),
    ...(icon ? [`icon: ${icon}`] : []),
    'generated: true',
    `generated_by: ${yamlString(GENERATOR)}`,
    `release: ${yamlString(release)}`,
    `content_hash: ${yamlString(contentHash)}`,
    `source_hash: ${yamlString(sourceSha)}`,
    '---',
    '',
  ].join('\n')
}

export function renderReference({ product, surface, openapi, release, sourceSha, contentHash }) {
  validateArtifacts({ surface, openapi, product })
  assert(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release), 'release must be a semver tag such as v1.2.3')
  assert(/^[0-9a-f]{40}$/.test(sourceSha), 'source SHA must be a full 40-character commit SHA')
  const config = PRODUCTS[product]
  const cliDir = `${config.referenceDir}/cli`
  const apiDir = `${config.referenceDir}/api`
  const specPath = `${apiDir}/openapi.yaml`
  const stamp = { release, contentHash, sourceSha }
  const releaseNote = `<Note>Generated from the ${config.name} ${text(release)} release (source ${code(sourceSha.slice(0, 12))}). For an installed version, ${code(`${config.binary} api <command> --help`)} is authoritative.</Note>\n\n`

  const visible = surface.operations
    .filter((op) => !op.cli.hidden)
    .sort((a, b) => a.cli.command.join(' ').localeCompare(b.cli.command.join(' ')))
  const groups = new Map()
  for (const op of visible) {
    const name = op.cli.command[0]
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(op)
  }
  const groupNames = [...groups.keys()].sort()

  const files = new Map()
  const specHeader = [
    `# Generated by ${GENERATOR} from the public OpenAPI document of the published`,
    `# ${config.name} ${release} release (source ${sourceSha}). Do not edit.`,
    '# Alias path items that only $ref another path are omitted.',
    '',
  ].join('\n')
  files.set(specPath, specHeader + withoutAliasPaths(openapi.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')).replace(/\s*$/, '\n'))

  const binary = `${config.binary} api`
  let overview = frontmatter({ title: `${binary} CLI reference`, description: `Every ${binary} command, its options and exit codes`, sidebarTitle: 'Overview', icon: 'square-terminal', ...stamp })
  overview += releaseNote
  overview += `${code(binary)} calls the ${config.name} API exactly as the [API reference](#api-reference) describes it: one command per public operation, generated from the release's API contract. Every command prints JSON on stdout with the response envelope removed; errors go to stderr as the structured error object.\n\n`
  overview += '## Authentication\n\n| Variable | Meaning |\n| --- | --- |\n'
  overview += config.environment.map(([name, meaning]) => `| ${code(name)} | ${meaning} |`).join('\n') + '\n\n'
  overview += '## Universal options\n\n| Option | Applies to | Description |\n| --- | --- | --- |\n'
  overview += UNIVERSAL_OPTIONS.map(([flag, scope, about]) => `| ${code(flag)} | ${scope} | ${cell(about)} |`).join('\n') + '\n\n'
  overview += 'Commands marked as requiring confirmation ask for `yes` in a terminal. Without a terminal they refuse to send the request unless `--yes` is set, print a `CONFIRMATION_REQUIRED` error and exit with code 9.\n\n'
  overview += '## Exit codes\n\n| Code | Meaning |\n| --- | --- |\n'
  overview += EXIT_CODES.map(([exit, meaning]) => `| ${exit} | ${meaning} |`).join('\n') + '\n\n'
  overview += `## Agent context\n\n${code(`${binary} agent-context`)} prints this command catalog for AI agents as Markdown, or as JSON with ${code('--json')}: every command with its usage, arguments, confirmation, availability and MCP tool name, plus the universal options and exit codes above.\n\n`
  overview += '## Commands\n\n| Command group | Covers |\n| --- | --- |\n'
  for (const name of groupNames) {
    const tags = [...new Set(groups.get(name).flatMap((op) => op.tags ?? []))].sort()
    overview += `| [${code(`${binary} ${name}`)}](/${cliDir}/${name}) | ${tags.length ? cell(tags.join(', ')) : '—'} |\n`
  }
  overview += `\n## API reference\n\nThe ${config.name} API reference in this section is generated from the same release's public OpenAPI document.\n`
  files.set(`${cliDir}/overview.mdx`, overview)

  for (const name of groupNames) {
    let page = frontmatter({ title: `${binary} ${name}`, description: `Generated reference for the ${binary} ${name} commands`, sidebarTitle: name, ...stamp })
    page += releaseNote
    page += groups.get(name).map((op) => renderCommand(product, op)).join('\n')
    files.set(`${cliDir}/${name}.mdx`, page)
  }

  const navigation = {
    group: 'Reference',
    pages: [
      { group: 'CLI', icon: 'square-terminal', root: `${cliDir}/overview`, pages: groupNames.map((name) => `${cliDir}/${name}`) },
      { group: 'API', icon: 'code', openapi: { source: specPath, directory: apiDir } },
    ],
  }
  return { files, navigation, directories: [cliDir, apiDir] }
}

function findEntry(entries, match) {
  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== 'object') continue
    if (match(entry)) return entry
    const nested = findEntry(entry.pages ?? entry.groups, match)
    if (nested) return nested
  }
  return null
}

// The committed navigation owns labels, icons and positions: the CLI group is
// found by its root page and the API group by its OpenAPI source. A tab without
// them gets the generated Reference group at its end.
export function applyNavigation(docs, navigation, product) {
  const config = PRODUCTS[product]
  const englishNavigation = docs.navigation?.languages?.find((candidate) => candidate.language === 'en')
  const tabs = englishNavigation?.tabs ?? docs.navigation?.tabs
  const tab = tabs?.find((candidate) => candidate.tab === config.tab)
  assert(tab, `docs.json has no ${config.tab} tab`)
  const [cli, api] = navigation.pages
  const existingCli = findEntry(tab.groups, (entry) => entry.root === cli.root)
  const existingApi = findEntry(tab.groups, (entry) => (entry.openapi?.source ?? entry.openapi) === api.openapi.source)
  if (existingCli) existingCli.pages = cli.pages
  if (existingApi) existingApi.openapi = api.openapi
  if (!existingCli && !existingApi) tab.groups.push(structuredClone(navigation))
  else assert(existingCli && existingApi, `docs.json ${config.tab} tab has only one of the generated CLI and API groups`)
  return docs
}

function hash(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function listFiles(root, directory) {
  const absolute = path.join(root, directory)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/'))
}

export function syncReference({ repoRoot, product, surfaceBytes, openapi, release, sourceSha, mode }) {
  const surface = JSON.parse(surfaceBytes.toString('utf8'))
  const { files, navigation, directories } = renderReference({ product, surface, openapi, release, sourceSha, contentHash: hash(surfaceBytes) })
  const docsPath = path.join(repoRoot, 'docs.json')
  const docsText = readFileSync(docsPath, 'utf8')
  const nextDocs = `${JSON.stringify(applyNavigation(JSON.parse(docsText), navigation, product), null, 2)}\n`
  if (mode === 'check') {
    const drift = []
    const present = new Set(directories.flatMap((directory) => listFiles(repoRoot, directory)))
    for (const [relative, content] of files) {
      const absolute = path.join(repoRoot, relative)
      if (!existsSync(absolute) || readFileSync(absolute, 'utf8') !== content) drift.push(relative)
      present.delete(relative)
    }
    drift.push(...present)
    if (nextDocs !== docsText) drift.push('docs.json')
    return { files: [...files.keys()].sort(), drift: drift.sort() }
  }
  for (const directory of directories) rmSync(path.join(repoRoot, directory), { recursive: true, force: true })
  for (const [relative, content] of files) {
    mkdirSync(path.dirname(path.join(repoRoot, relative)), { recursive: true })
    writeFileSync(path.join(repoRoot, relative), content)
  }
  writeFileSync(docsPath, nextDocs)
  return { files: [...files.keys()].sort(), drift: [] }
}

function main() {
  const args = process.argv.slice(2)
  const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const mode = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : null
  const required = ['--product', '--surface', '--openapi', '--release', '--source-sha']
  if (!mode || required.some((name) => !value(name))) {
    throw new Error('usage: node render-api-surface-reference.mjs --product <product> --surface <api-surface.json> --openapi <openapi.public.yaml> --release <tag> --source-sha <sha> (--write | --check)')
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const result = syncReference({
    repoRoot,
    product: value('--product'),
    surfaceBytes: readFileSync(path.resolve(value('--surface'))),
    openapi: readFileSync(path.resolve(value('--openapi')), 'utf8'),
    release: value('--release'),
    sourceSha: value('--source-sha'),
    mode,
  })
  if (result.drift.length) {
    process.stderr.write(`api_surface_reference_drift:\n${result.drift.map((file) => ` - ${file}`).join('\n')}\n`)
    process.exit(1)
  }
  process.stdout.write(`api_surface_reference: ${value('--product')} ${value('--release')} ${result.files.length} files ${mode === 'check' ? 'current' : 'written'}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
