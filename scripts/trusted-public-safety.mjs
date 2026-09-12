import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// This entrypoint and the policy must come from the ruleset-bound producer
// checkout. The candidate is data only; never import its scripts or mise tasks.
const [candidatePath, sourceSha, producerSha] = process.argv.slice(2);
const producer = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const candidate = realpathSync(candidatePath);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
for (const sha of [sourceSha, producerSha]) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Missing full source or producer SHA');
}
if (candidate === producer || candidate.startsWith(producer + sep) || producer.startsWith(candidate + sep)) {
  throw new Error('Producer and candidate must be separate checkouts');
}
if (git('-C', producer, 'rev-parse', 'HEAD') !== producerSha ||
    git('-C', candidate, 'rev-parse', 'HEAD') !== sourceSha) {
  throw new Error('Checkout identity does not match evidence identity');
}
if (git('-C', candidate, 'status', '--porcelain', '--untracked-files=all')) {
  throw new Error('Candidate tree differs from exact source');
}
// Links and submodules can escape the scanned tree or hide unscanned content.
const entries = execFileSync('git', ['-C', candidate, 'ls-files', '--stage', '-z'], { encoding: 'utf8' });
if (entries.split('\0').some(entry => /^(120000|160000) /.test(entry))) {
  throw new Error('Candidate links and submodules are not supported by this static gate');
}
execFileSync('pwsh', ['-NoLogo', '-NoProfile', '-File', resolve(producer, 'scripts/assert-public-safety.ps1'),
  '-RepoRoot', candidate, '-PolicyPath', resolve(producer, 'public-safety-policy.json')],
{ cwd: producer, stdio: 'inherit' });
console.log(JSON.stringify({ check: 'trusted-public-safety', source_sha: sourceSha, producer_sha: producerSha, result: 'PASS' }));
