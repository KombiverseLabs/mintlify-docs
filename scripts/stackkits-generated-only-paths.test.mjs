import assert from 'node:assert/strict'
import test from 'node:test'
import { unexpectedStackkitsReleasePaths } from './stackkits-generated-only-paths.mjs'

test('scratch downloads and collapsed data/ are generated-only, unrelated paths are not', () => {
  const allowed = [
    '?? .tmp/',
    '?? .tmp/stackkits-docs/stackkits-use-case-catalog-v1.json',
    '?? data/',
    '?? data/stackkits/latest.json',
    ' M stackkits/reference/use-case-catalog.mdx',
    ' M stackkits/reference/os-compatibility.mdx',
    ' M stackkits/reference/application-delivery-compatibility.mdx',
    ' M stackkits/reference/cli/init.mdx',
    '?? stackkits/reference/cli/new-command.mdx',
    ' D stackkits/reference/cli/retired.mdx',
    ' M docs.json',
  ].join('\n')
  assert.deepEqual(unexpectedStackkitsReleasePaths(allowed), [])

  const mixed = `${allowed}\n?? README.md\n?? data/other.json\n?? stackkits/reference/cli/nested/page.mdx\n M guides/stackkits/use-cases/overview.mdx`
  const unexpected = unexpectedStackkitsReleasePaths(mixed)
  assert.ok(unexpected.includes('README.md'))
  // The use-case guides are hand-written; the sync must never overwrite them.
  assert.ok(unexpected.includes('guides/stackkits/use-cases/overview.mdx'))
  assert.ok(unexpected.includes('data/other.json'))
  assert.ok(unexpected.includes('stackkits/reference/cli/nested/page.mdx'))
  assert.ok(!unexpected.includes('.tmp/'))
  assert.ok(!unexpected.includes('data/'))
  assert.ok(!unexpected.includes('data/stackkits/latest.json'))
})
