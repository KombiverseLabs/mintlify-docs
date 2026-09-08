import assert from 'node:assert/strict'
import test from 'node:test'
import { unexpectedStackkitsReleasePaths } from './stackkits-generated-only-paths.mjs'

test('scratch downloads and collapsed data/ are generated-only, unrelated paths are not', () => {
  const allowed = [
    '?? .tmp/',
    '?? .tmp/stackkits-docs/stackkits-use-case-catalog-v1.json',
    '?? data/',
    '?? data/stackkits/latest.json',
    ' M guides/stackkits/use-cases/overview.mdx',
    ' M stackkits/reference/os-compatibility.mdx',
    ' M stackkits/reference/application-delivery-compatibility.mdx',
  ].join('\n')
  assert.deepEqual(unexpectedStackkitsReleasePaths(allowed), [])

  const mixed = `${allowed}\n?? README.md\n?? data/other.json`
  const unexpected = unexpectedStackkitsReleasePaths(mixed)
  assert.ok(unexpected.includes('README.md'))
  assert.ok(unexpected.includes('data/other.json'))
  assert.ok(!unexpected.includes('.tmp/'))
  assert.ok(!unexpected.includes('data/'))
  assert.ok(!unexpected.includes('data/stackkits/latest.json'))
})
