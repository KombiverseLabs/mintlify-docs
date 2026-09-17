import assert from 'node:assert/strict'
import test from 'node:test'
import { applyNavigation, renderCliReference } from './render-stackkits-cli-reference.mjs'

const SHA = 'a'.repeat(40)

function reference(overrides = {}) {
  return {
    schemaVersion: 'stackkits-cli-reference/v1',
    program: 'stackkit',
    usage: 'stackkit [command]',
    short: 'Set up your services',
    description: '',
    globalFlags: [],
    groups: [{ id: 'start', title: 'Set up your services' }],
    commands: [
      {
        path: 'stackkit init',
        name: 'init',
        parent: 'stackkit',
        group: 'start',
        usage: 'stackkit init [flags]',
        short: 'Initialize a deployment',
        description: '',
        runnable: true,
        examples: [],
        flags: [],
        subcommands: [],
      },
    ],
    ...overrides,
  }
}

test('input that is not a complete CLI reference is rejected', () => {
  assert.throws(() => renderCliReference(reference({ schemaVersion: 'stackkits-cli-reference/v0' }), { sourceSha: SHA, contentHash: 'sha256:x' }))
  const dangling = reference()
  dangling.commands[0].subcommands = ['stackkit init missing']
  assert.throws(() => renderCliReference(dangling, { sourceSha: SHA, contentHash: 'sha256:x' }))
})

test('help text renders as literal prose, not MDX', () => {
  const hostile = reference()
  hostile.commands[0].description = 'Run {process.env.TOKEN} <script>alert(1)</script> [docs](javascript:alert(1)) *now*'
  hostile.commands[0].flags = [{ name: 'mode', type: 'string', default: '', description: '<b>{mode}</b> | [x](y)', required: false }]
  const { pages } = renderCliReference(hostile, { sourceSha: SHA, contentHash: 'sha256:x' })
  const body = pages.get('stackkits/reference/cli/init.mdx').split('\n---\n').slice(1).join('\n---\n')
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
  assert.match(prose, /process\.env\.TOKEN/)
  assert.match(prose, /mode/)
  assert.doesNotMatch(prose, /[<>{}]/)
  assert.doesNotMatch(prose, /(^|[^\\])\[/)
  assert.doesNotMatch(prose, /(^|[^\\])\*/)
})

test('navigation update replaces only the command pages of the nested CLI group', () => {
  const cli = { group: 'Commands', icon: 'terminal', root: 'stackkits/reference/cli/overview', pages: ['old'] }
  const docs = {
    navigation: {
      tabs: [
        { tab: 'StackKits', groups: [{ group: 'Get started', pages: ['a'] }, { group: 'Reference', pages: [cli, 'b'] }] },
        { tab: 'SpeechKit', groups: [{ group: 'Reference', pages: ['speech'] }] },
      ],
    },
  }
  const { navigation } = renderCliReference(reference(), { sourceSha: SHA, contentHash: 'sha256:x' })
  const updated = applyNavigation(structuredClone(docs), navigation)
  const [kept, sibling] = updated.navigation.tabs[0].groups[1].pages
  assert.equal(kept.group, cli.group)
  assert.equal(kept.icon, cli.icon)
  assert.deepEqual(kept.pages, navigation.pages)
  assert.equal(sibling, 'b')
  assert.deepEqual(updated.navigation.tabs[0].groups[0], docs.navigation.tabs[0].groups[0])
  assert.deepEqual(updated.navigation.tabs[1], docs.navigation.tabs[1])
})
