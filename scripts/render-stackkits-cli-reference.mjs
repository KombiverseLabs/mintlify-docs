// Renders the StackKits CLI reference pages from the generated command-tree
// projection `stackkits-cli-reference/v1` (StackKits: `stackkit docs
// emit-cli-reference`). Pages are generated, never hand-edited.
//
// Usage: node scripts/render-stackkits-cli-reference.mjs --from <cli-reference.json> --source-sha <sha> --write
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const CLI_GENERATOR = 'stackkit docs emit-cli-reference'
export const CLI_PAGE_DIR = 'stackkits/reference/cli'
const SCHEMA = 'stackkits-cli-reference/v1'
const CLI_INSTALL = 'curl -sSL https://install.stackkit.cc | STACKKIT_CLI_ONLY=1 sh'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateCliReference(reference) {
  assert(reference?.schemaVersion === SCHEMA, `CLI reference schemaVersion must be ${SCHEMA}`)
  assert(reference.program === 'stackkit', 'CLI reference program must be stackkit')
  assert(Array.isArray(reference.commands) && reference.commands.length > 0, 'CLI reference needs commands')
  assert(Array.isArray(reference.globalFlags) && Array.isArray(reference.groups), 'CLI reference needs globalFlags and groups')
  const paths = new Set()
  for (const command of reference.commands) {
    assert(/^stackkit( [a-z0-9][a-z0-9-]*)+$/.test(command.path), `invalid command path ${command.path}`)
    assert(!paths.has(command.path), `duplicate command ${command.path}`)
    paths.add(command.path)
    assert(Array.isArray(command.flags) && Array.isArray(command.examples) && Array.isArray(command.subcommands), `${command.path} needs flags, examples and subcommands`)
  }
  for (const command of reference.commands) {
    for (const child of command.subcommands) assert(paths.has(child), `${command.path} lists unknown subcommand ${child}`)
  }
  return reference
}

// Help text is prose, never markup: MDX expressions, JSX, links and emphasis
// from the command tree render literally.
function text(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('*', '\\*')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    // Flags in prose become code, so typography never turns `--flag` into a dash.
    .replace(/(^|[\s('"])(--[a-z0-9][a-z0-9-]*(?:=[A-Za-z0-9._:/-]+)?)(?=$|[\s),.;:'"])/g, '$1`$2`')
}

function cell(value) {
  return text(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function code(value) {
  // Inline code in a table cell: escape the pipe, keep the rest literal.
  return `\`${String(value).replaceAll('|', '\\|').replaceAll('`', "'")}\``
}

function yamlString(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function anchor(commandPath) {
  return commandPath.toLowerCase().replaceAll(' ', '-')
}

function pageName(topLevel) {
  return topLevel.split(' ')[1]
}

// Cobra long descriptions mix prose with indented command lists; indented
// paragraphs become text blocks so their alignment survives.
function description(value) {
  const paragraphs = String(value ?? '').trim().split(/\n\s*\n/).filter(Boolean)
  return paragraphs.map((paragraph) => {
    const lines = paragraph.split('\n')
    if (lines.some((line) => /^\s{2,}\S/.test(line))) {
      return `\`\`\`text\n${lines.join('\n')}\n\`\`\``
    }
    return text(lines.map((line) => line.trim()).join(' '))
  }).join('\n\n')
}

function flagRows(flags) {
  return flags.map((flag) => {
    const name = `--${flag.name}${flag.shorthand ? `, -${flag.shorthand}` : ''}`
    const notes = [flag.required ? '**Required.**' : '', cell(flag.description)].filter(Boolean).join(' ')
    const fallback = flag.default === undefined || flag.default === '' ? '—' : code(flag.default)
    return `| ${code(name)} | ${cell(flag.type)} | ${fallback} | ${notes} |`
  })
}

function renderCommand(command, byPath, depth, pageRoot) {
  const heading = '#'.repeat(Math.min(depth + 2, 4))
  const lines = [`${heading} ${command.path}`, '']
  if (command.short) lines.push(`${text(command.short)}.`, '')
  if (command.aliases?.length) lines.push(`Aliases: ${command.aliases.map((alias) => code(alias)).join(', ')}`, '')
  if (command.deprecated) lines.push(`<Warning>Deprecated: ${text(command.deprecated)}</Warning>`, '')
  if (command.legacy) lines.push('<Warning>Current releases refuse this command; it belongs to the exact v0.6 compatibility line.</Warning>', '')
  if (command.description) lines.push(description(command.description), '')
  lines.push('```bash', command.usage, '```', '')
  const own = command.flags.filter((flag) => !flag.inheritedFrom)
  const inherited = command.flags.filter((flag) => flag.inheritedFrom)
  if (own.length) {
    lines.push('| Flag | Type | Default | Description |', '| --- | --- | --- | --- |', ...flagRows(own), '')
  }
  if (inherited.length) {
    const parents = [...new Set(inherited.map((flag) => flag.inheritedFrom))]
    lines.push(`Inherited from ${parents.map((parent) => commandLink(parent, pageRoot)).join(', ')}:`, '')
    lines.push('| Flag | Type | Default | Description |', '| --- | --- | --- | --- |', ...flagRows(inherited), '')
  }
  if (command.examples.length) {
    lines.push('**Examples**', '', '```bash')
    command.examples.forEach((example, index) => {
      if (index > 0) lines.push('')
      if (example.description) lines.push(`# ${example.description}`)
      lines.push(example.command)
    })
    lines.push('```', '')
  }
  const children = command.subcommands.map((child) => byPath.get(child)).filter((child) => child && !child.legacy && !child.deprecated)
  if (children.length) {
    lines.push(`Subcommands: ${children.map((child) => commandLink(child.path, pageRoot)).join(', ')}`, '')
    for (const child of children) lines.push(renderCommand(child, byPath, depth + 1, pageRoot))
  }
  return lines.join('\n')
}

// Every command below a page's top-level command has a heading on that page;
// the top-level command itself is the page title and has no anchor.
function commandLink(commandPath, pageRoot) {
  if (commandPath === pageRoot) return code(commandPath)
  const topLevel = commandPath.split(' ').slice(0, 2).join(' ')
  if (topLevel === pageRoot) return `[${code(commandPath)}](#${anchor(commandPath)})`
  const page = `/${CLI_PAGE_DIR}/${pageName(topLevel)}`
  return `[${code(commandPath)}](${commandPath === topLevel ? page : `${page}#${anchor(commandPath)}`})`
}

function frontmatter({ title, description: summary, sidebarTitle, icon, contentHash, sourceSha }) {
  return [
    '---',
    `title: ${yamlString(title)}`,
    `description: ${yamlString(summary)}`,
    `sidebarTitle: ${yamlString(sidebarTitle)}`,
    ...(icon ? [`icon: ${icon}`] : []),
    'generated: true',
    `generated_by: ${yamlString(CLI_GENERATOR)}`,
    `content_hash: ${yamlString(contentHash)}`,
    `source_hash: ${yamlString(sourceSha)}`,
    '---',
    '',
  ].join('\n')
}

export function renderCliReference(reference, { sourceSha, contentHash }) {
  validateCliReference(reference)
  assert(/^[0-9a-f]{40}$/.test(sourceSha), 'source SHA must be a full 40-character commit SHA')
  const byPath = new Map(reference.commands.map((command) => [command.path, command]))
  const current = (command) => !command.legacy && !command.deprecated
  const topLevel = reference.commands.filter((command) => command.parent === 'stackkit')
  const pages = new Map()
  const groupPages = []

  let overview = frontmatter({ title: 'CLI reference', description: 'Every stackkit command with its flags and examples', sidebarTitle: 'Overview', icon: 'square-terminal', contentHash, sourceSha })
  overview += `${text(reference.short)}. These pages list every \`stackkit\` command with its flags and examples. They are generated from the StackKits command definitions; if your installed version is older, \`stackkit <command> --help\` is authoritative for it.\n\n`
  overview += '## Install the CLI\n\n```bash\n' + CLI_INSTALL + '\n```\n\n'
  overview += `With \`STACKKIT_CLI_ONLY=1\` the installer puts \`stackkit\`, \`stackkit-server\`, \`stackkit-mcp\`, packaged OpenTofu and the public kit catalog into \`~/.stackkits\` without installing a StackKit. Without it, the installer detects the host and continues into Basement Kit or Cloud Kit.\n\n`
  overview += '## Global flags\n\nThese flags work with every command.\n\n'
  overview += '| Flag | Type | Default | Description |\n| --- | --- | --- | --- |\n' + flagRows(reference.globalFlags).join('\n') + '\n\n'

  for (const group of reference.groups) {
    const members = topLevel.filter((command) => command.group === group.id && current(command))
    if (!members.length) continue
    overview += `## ${text(group.title)}\n\n| Command | Description |\n| --- | --- |\n`
    for (const command of members) {
      overview += `| [${code(command.path)}](/${CLI_PAGE_DIR}/${pageName(command.path)}) | ${cell(command.short)} |\n`
    }
    overview += '\n'
    groupPages.push({ group: group.title, pages: members.map((command) => `${CLI_PAGE_DIR}/${pageName(command.path)}`) })
    for (const command of members) {
      const name = pageName(command.path)
      const body = frontmatter({ title: command.path, description: command.short || command.path, sidebarTitle: name, contentHash, sourceSha }) + renderCommand(command, byPath, -1, command.path).replace(/^#+ .*\n\n/, '') + '\n'
      pages.set(`${CLI_PAGE_DIR}/${name}.mdx`, body)
    }
  }

  const retired = reference.commands.filter((command) => !current(command))
  if (retired.length) {
    let legacy = frontmatter({ title: 'Legacy and deprecated commands', description: 'Commands current releases refuse or replace', sidebarTitle: 'Legacy and deprecated', contentHash, sourceSha })
    legacy += 'These commands exist in the command tree but are not part of the current workflow. Legacy commands are refused on current releases; deprecated commands still run and name their replacement.\n\n'
    for (const command of retired) legacy += renderCommand({ ...command, subcommands: [] }, byPath, 0, null) + '\n'
    pages.set(`${CLI_PAGE_DIR}/legacy.mdx`, legacy)
    overview += `Commands that current releases refuse or replace are listed under [legacy and deprecated commands](/${CLI_PAGE_DIR}/legacy).\n`
  }
  pages.set(`${CLI_PAGE_DIR}/overview.mdx`, overview)

  const navigation = {
    group: 'CLI',
    icon: 'square-terminal',
    root: `${CLI_PAGE_DIR}/overview`,
    pages: [...groupPages, ...(retired.length ? [`${CLI_PAGE_DIR}/legacy`] : [])],
  }
  return { pages, navigation }
}

// The CLI group is found by its root page wherever docs.json places it, so the
// committed navigation owns its label, icon and position; only the command
// pages are regenerated. A tab without it gets the group at the top of Reference.
function findGroup(entries, root) {
  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== 'object') continue
    if (entry.root === root) return entry
    const nested = findGroup(entry.pages, root)
    if (nested) return nested
  }
  return null
}

export function applyNavigation(docs, navigation) {
  const englishNavigation = docs.navigation?.languages?.find((candidate) => candidate.language === 'en')
  const tabs = englishNavigation?.tabs ?? docs.navigation?.tabs
  const tab = tabs?.find((candidate) => candidate.tab === 'StackKits')
  assert(tab, 'docs.json has no StackKits tab')
  const existing = findGroup(tab.groups, navigation.root)
  if (existing) {
    existing.pages = navigation.pages
    return docs
  }
  const reference = tab.groups.find((group) => group.group === 'Reference')
  assert(reference, 'docs.json StackKits tab has no Reference group')
  reference.pages.unshift(navigation)
  return docs
}

export function writeCliReference({ repoRoot, reference, referenceBytes, sourceSha }) {
  const contentHash = `sha256:${createHash('sha256').update(referenceBytes).digest('hex')}`
  const { pages, navigation } = renderCliReference(reference, { sourceSha, contentHash })
  const directory = path.join(repoRoot, CLI_PAGE_DIR)
  rmSync(directory, { recursive: true, force: true })
  for (const [relative, content] of pages) {
    mkdirSync(path.dirname(path.join(repoRoot, relative)), { recursive: true })
    writeFileSync(path.join(repoRoot, relative), content)
  }
  const docsPath = path.join(repoRoot, 'docs.json')
  const docs = applyNavigation(JSON.parse(readFileSync(docsPath, 'utf8')), navigation)
  writeFileSync(docsPath, `${JSON.stringify(docs, null, 2)}\n`)
  return { pages: [...pages.keys()].sort(), written: readdirSync(directory).length }
}

function main() {
  const args = process.argv.slice(2)
  const value = (name) => args[args.indexOf(name) + 1]
  if (!args.includes('--write') || !value('--from') || !value('--source-sha')) {
    throw new Error('usage: node render-stackkits-cli-reference.mjs --from <cli-reference.json> --source-sha <sha> --write')
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const referenceBytes = readFileSync(path.resolve(value('--from')))
  const result = writeCliReference({ repoRoot, reference: JSON.parse(referenceBytes.toString('utf8')), referenceBytes, sourceSha: value('--source-sha') })
  process.stdout.write(`stackkits_cli_reference: ${result.pages.length} pages\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
