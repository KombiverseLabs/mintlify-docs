#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { languageLines } from './engineering-source-audit.mjs';

const policyURL = new URL('./policy.json', import.meta.url);
const prose = /\.(?:md|mdx|rst|adoc|txt)$/i;
const excluded = /(?:^|\/)(?:node_modules|vendor|third_party|dist|build|\.beads)\//;
// This existing scope intentionally exercises German conversations; it is not
// German engineering documentation (platform-i30rl and §11.2).
const localeFixture = /(?:^|\/)live-scenarios\/[^/]+\.de\.md$/;
const decoder = new TextDecoder('utf-8', { fatal: true });
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function localizedPayload(file, owner, policy) {
  if (localeFixture.test(file) || /(?:^|\/)(?:tests?\/)?fixtures\/(?:locale|unicode|bidi|translation)\//.test(file)) return 'locale-fixture';
  if (/(?:^|\/)legal\/.*\.(?:md|mdx|rst|adoc|txt)$/i.test(file)) return 'legal-payload';
  for (const surface of policy.surfaces ?? []) {
    if (surface.repo_id !== owner) continue;
    if (Object.values(surface.catalogs ?? {}).includes(file)) return 'registered-localization-catalog';
    if (surface.adapter === 'mintlify-localization' && /\.mdx$/.test(file) &&
        [...(policy.required_locales ?? []), ...(policy.expansion_locales ?? [])]
          .some(locale => locale !== 'en' && file.startsWith(`${locale}/`))) return 'registered-customer-translation';
  }
  return null;
}

function maskPayloads(bytes, file, owner, policy) {
  const masked = Buffer.from(bytes);
  for (const scope of policy.engineering?.exemptions ?? []) {
    if (scope.repo_id !== owner || scope.path !== file || scope.blob_sha256 !== digest(bytes)) continue;
    if (!Number.isSafeInteger(scope.start_byte) || !Number.isSafeInteger(scope.end_byte) || scope.start_byte < 0 ||
        scope.end_byte > bytes.length || scope.end_byte <= scope.start_byte || scope.end_byte - scope.start_byte === bytes.length) {
      throw new Error(`Invalid registered payload range for ${file}`);
    }
    for (let i = scope.start_byte; i < scope.end_byte; i++) if (![10, 13].includes(masked[i])) masked[i] = 32;
  }
  let fence = null;
  return decoder.decode(masked).split(/\r?\n/).map(line => {
    const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (delimiter) {
      if (!fence) fence = { marker: delimiter[1][0], length: delimiter[1].length };
      else if (delimiter[1][0] === fence.marker && delimiter[1].length >= fence.length && /^ {0,3}[`~]+\s*$/.test(line)) fence = null;
      return '';
    }
    if (fence || /^\s*>/.test(line)) return ''; // Explicit code and quoted payload scopes.
    // The owner ledger must preserve the owner's words in their original
    // language. Only its explicit Source/Owner quoted payload is exempt.
    if (file === 'internal/records/DECISIONS.md' && /\|\s*Owner:/.test(line)) line = line.replace(/"[^"\n]*"/g, '');
    return line.replace(/(`+)([^`]|(?!\1)`)*?\1/g, '');
  }).join('\n');
}

export function checkChangedEngineeringProse({ repo, owner, base, head, exactBase = false, policy }) {
  const root = path.resolve(repo);
  const gitEnv = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' };
  for (const name of Object.keys(gitEnv)) if (name.startsWith('GIT_') && name !== 'GIT_NO_REPLACE_OBJECTS') delete gitEnv[name];
  const git = (...args) => execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30_000, windowsHide: true,
    env: gitEnv,
  });
  const revision = value => {
    const resolved = git('rev-parse', '--verify', `${value}^{commit}`).trim();
    if (!/^[a-f0-9]{40}$/.test(resolved)) throw new Error('An immutable Git revision is required.');
    return resolved;
  };
  const selectedHead = head ? revision(head) : null;
  const selectedBase = revision(base);
  // The trusted PR adapter supplies exact event-bound commit IDs. Comparing
  // their trees preserves the whole stack even when its history is shallow.
  if (exactBase && (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head ?? ''))) {
    throw new Error('--exact-base requires full immutable base and head commit IDs.');
  }
  const start = selectedHead && !exactBase ? git('merge-base', selectedBase, selectedHead).trim() : selectedBase;
  const range = selectedHead ? [start, selectedHead] : [start];
  const paths = git('diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', '--diff-filter=ACMT', ...range, '--')
    .split('\0').filter(Boolean);
  const untracked = new Set(selectedHead ? [] : git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean));
  paths.push(...untracked);
  const blob = (commit, file) => execFileSync('git', ['--no-replace-objects', '-C', root, 'show', `${commit}:${file}`],
    { env: gitEnv, maxBuffer: 2 * 1024 * 1024, timeout: 30_000, windowsHide: true });
  const findings = [], inspected = [], fixtures = [], payloads = [];
  for (const file of [...new Set(paths)].sort()) {
    if (!prose.test(file) || excluded.test(file)) continue;
    const payload = localizedPayload(file, owner, policy);
    if (payload) {
      payloads.push({ path: file, reason: payload });
      if (payload === 'locale-fixture') fixtures.push(file);
      continue;
    }
    if (file.startsWith('/') || file.includes('\\') || file.split('/').includes('..')) throw new Error('Unsafe changed path.');
    let bytes;
    if (selectedHead) {
      const mode = git('ls-tree', selectedHead, '--', file).split(' ')[0];
      if (!['100644', '100755'].includes(mode)) throw new Error(`Changed prose is not a regular Git blob: ${file}`);
      bytes = blob(selectedHead, file);
    } else {
      const absolute = path.join(root, file);
      if (!lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) throw new Error(`Changed prose is not a regular file: ${file}`);
      bytes = readFileSync(absolute);
    }
    if (bytes.length > 2 * 1024 * 1024) throw new Error(`Changed prose exceeds the bounded 2 MiB reader: ${file}`);
    if (bytes.includes(0)) throw new Error(`Changed prose contains NUL bytes; only UTF-8 text is supported: ${file}`);
    try { decoder.decode(bytes); } catch { throw new Error(`Changed prose is not valid UTF-8: ${file}`); }
    const added = new Set();
    // Candidate attributes may mark Markdown binary (-diff). The admitted prose
    // reader, not candidate attributes, determines whether text is inspected.
    const diff = git('diff', '--text', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=0', ...range, '--', file);
    let hunks = 0;
    for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
      hunks++;
      const count = match[2] === undefined ? 1 : Number(match[2]);
      for (let line = Number(match[1]); line < Number(match[1]) + count; line++) added.add(line);
    }
    if (untracked.has(file)) {
      for (let line = 1; line <= decoder.decode(bytes).split(/\r?\n/).length; line++) added.add(line);
    } else if (!hunks) {
      const before = git('ls-tree', start, '--', file).trim() ? blob(start, file) : Buffer.alloc(0);
      if (!before.equals(bytes)) throw new Error(`Changed prose content has no inspectable text hunks: ${file}`);
      // Identical content (including an empty added file or a mode-only change)
      // explains the absence of hunks; it adds no prose lines.
    }
    const detected = languageLines(maskPayloads(bytes, file, owner, policy));
    findings.push(...detected.filter(item => item.language === 'de' && added.has(item.line)).map(item => ({ path: file, ...item })));
    inspected.push({ path: file, added_lines: added.size });
  }
  return { base: start, head: selectedHead ?? 'working-tree', owner, inspected, locale_fixtures: fixtures, excluded_payloads: payloads, findings,
    detector: 'Existing distinct-lexical-markers-v1; >=3 distinct German markers per added prose line. Zero findings is not universal language proof.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  try {
    const base = option('--base');
    const owner = option('--repo-id');
    if (!base || !owner) throw new Error('--base and --repo-id are required; no historical full-tree fallback is admitted.');
    const result = checkChangedEngineeringProse({ repo: option('--repo') ?? '.', owner, base, head: option('--head'), exactBase: args.includes('--exact-base'),
      policy: JSON.parse(readFileSync(fileURLToPath(policyURL), 'utf8')) });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.findings.length) process.exitCode = 1;
  } catch (error) {
    console.error(`Changed engineering prose: ${error.message}`);
    process.exitCode = 1;
  }
}
