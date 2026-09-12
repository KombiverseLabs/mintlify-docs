import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const producer = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const producerSha = execFileSync('git', ['-C', producer, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const validator = join(producer, 'scripts/trusted-public-safety.mjs');

// Registered sensitive boundary: PR-owned executable/configuration changes
// must not suppress protected-source publication-safety findings.
test('trusted CLI rejects tampered PR evidence, missing identity and stale source', () => {
  const root = mkdtempSync(join(tmpdir(), 'mintlify-trusted-boundary-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (name, value) => {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
  };
  const commit = () => {
    git('add', '.');
    git('-c', 'user.name=Boundary Test', '-c', 'user.email=boundary@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const run = (sha, authority = producerSha) => spawnSync(process.execPath, [validator, root, sha, authority], { encoding: 'utf8' });
  try {
    git('init', '-q');
    write('docs.json', JSON.stringify({ navigation: { tabs: [{ tab: 'Start', groups: [{ group: 'Test', pages: ['index'] }] }] } }));
    write('index.mdx', '---\ntitle: Test\ndescription: Public page\n---\n# Public\n');
    // These candidate files intentionally claim success; none may be executed.
    write('.github/workflows/trusted-public-safety.yml', 'name: Trusted Public Safety\non: pull_request\njobs:\n  trusted-public-safety:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: exit 0\n');
    write('scripts/assert-public-safety.ps1', 'exit 0\n');
    write('scripts/trusted-public-safety.mjs', 'process.exit(0);\n');
    write('mise.toml', '[tasks."ci:security"]\nrun = "exit 0"\n');
    write('public-safety-policy.json', '{}');
    const safe = commit();
    const positive = run(safe);
    assert.equal(positive.status, 0, positive.stdout + positive.stderr);
    assert.notEqual(run(safe, '0'.repeat(40)).status, 0);
    assert.notEqual(run('').status, 0);
    write('index.mdx', '---\ntitle: Test\ndescription: Public page\nhidden: true\n---\n# Hidden but directly published\n');
    const unsafe = commit();
    assert.notEqual(run(safe).status, 0, 'stale source must fail');
    assert.notEqual(run(unsafe).status, 0, 'candidate fake workflow/checker/policy must not hide finding');
    write('index.mdx', '---\ntitle: Test\ndescription: Public page\n---\n# Public\n');
    assert.notEqual(run(unsafe).status, 0, 'uncommitted repair cannot produce exact-source evidence');
  } finally {
    // Only the test-owned directory returned by mkdtemp is removed.
    rmSync(root, { recursive: true, force: true });
  }
});
