#!/usr/bin/env node
// Canonical Kombify host adapter. The exchange implementation is projected from
// beads-cloudflare/cli/github-auth.mjs; repository configuration contains no keys.
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGithubCredential, readGithubCredentials, updateCredentialFile, githubCredentialKey } from './lib/beads-github-auth.mjs';
import { ensureSessionTools } from './beads-session-tools.mjs';

const root = resolve(import.meta.dirname, '..');
// This adapter is part of the trusted Kombify bootstrap, not an arbitrary URL
// supplied by a checked-out feature branch. Other installations use the OSS CLI.
const trustedOrigin = 'https://beads-cloudflare.soulcreek.workers.dev';
function credentialFile(env = process.env) {
  const home = process.platform === 'win32' ? env.APPDATA : process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support') : env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return home && join(home, 'beads-cloudflare', 'credentials.json');
}
export async function access(config, { allowStatic = false, env = process.env, fetchImpl = fetch, cacheFile = credentialFile(env) } = {}) {
  if (config.base !== trustedOrigin || !/^KombiverseLabs\/[A-Za-z0-9_.-]+$/.test(config.github_repository)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.tracker)) throw new Error('Invalid Kombify tracker binding');
  const file = cacheFile;
  const credentials = file && existsSync(file) ? readGithubCredentials(file) : {};
  const machineKey = allowStatic && env.BEADS_CLOUDFLARE_TOKEN;
  if (machineKey && !/^[!-~]+$/.test(machineKey)) throw new Error('Machine tracker credential is malformed');
  const entry = machineKey ? { token: machineKey, expires_at: null, static: true } : await resolveGithubCredential({ base: config.base, repository: config.github_repository,
    tracker: config.tracker, credentials,
    env: { ...env, BEADS_CLOUDFLARE_TRUSTED_ORIGINS: trustedOrigin }, fetchImpl });
  const response = await fetchImpl(`${config.base}/t/${config.tracker}/v0/beads/context`, {
    headers: { Authorization: `Bearer ${entry.token}` }, redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Tracker access refused (HTTP ${response.status})`);
  await response.body?.cancel();
  if (file && (!entry.cached || credentials[config.base]?.github_trusted !== true)) await updateCredentialFile(file, doc => {
    doc[config.base] = { ...doc[config.base], github_trusted: true, ...(!entry.static ? { github: { ...doc[config.base]?.github,
      [githubCredentialKey(config.github_repository, config.tracker)]: { token: entry.token, expires_at: entry.expires_at } } } : {}) };
    return doc;
  });
  return entry;
}
// Non-secret project bootstrap. Concurrent callers preserve the first Dolt
// metadata snapshot, and no database, export or credential is moved or deleted.
export function bootstrapCloudflare(config, repositoryRoot = root) {
  if (config.authority !== 'cloudflare') return;
  const beads = join(repositoryRoot, '.beads');
  mkdirSync(beads, { recursive: true });
  const metadataFile = join(beads, 'metadata.json');
  const current = existsSync(metadataFile) ? JSON.parse(readFileSync(metadataFile, 'utf8')) : {};
  if (current.backend && !['dolt', 'cloudflare'].includes(current.backend)) throw new Error('Unsupported previous tracker authority');
  if (current.backend === 'dolt') {
    try { writeFileSync(join(beads, 'dolt-comparison.json'), JSON.stringify(current, null, 2)+'\n', { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const atomic = (file, value) => {
    const staged = `${file}.${randomUUID()}.tmp`;
    try { writeFileSync(staged, JSON.stringify(value, null, 2)+'\n', { flag: 'wx' }); renameSync(staged, file); }
    finally { rmSync(staged, { force: true }); }
  };
  atomic(join(beads, 'cloudflare.json'), { backend: 'cloudflare', base: config.base, tracker: config.tracker,
    github_repository: config.github_repository, token_env: 'BEADS_CLOUDFLARE_TOKEN' });
  atomic(metadataFile, { ...current, backend: 'cloudflare' });
  // bd resolves this legacy redirect before consulting metadata. Retire only
  // the local pointer after the validated repository binding is complete.
  rmSync(join(beads, 'redirect'), { force: true });
}
async function main(args) {
  const internal = args.includes('--credential');
  const config = internal ? JSON.parse(readFileSync(0, 'utf8'))
    : JSON.parse(readFileSync(join(root, '.kombify', 'beads-cloudflare.json'), 'utf8'));
  const entry = await access(config, { allowStatic: !internal });
  if (!internal) {
    if (await ensureSessionTools() !== 0) throw new Error('Pinned native Cloudflare bd could not be provisioned');
    bootstrapCloudflare(config);
  }
  // --credential is a pipe protocol used only by the governed writer; normal
  // invocations never print a token or ask an operator to copy one.
  console.log(internal ? JSON.stringify(entry) : `BEADS_CLOUDFLARE_ACCESS_OK repository=${config.github_repository} tracker=${config.tracker}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2)).catch(() => {
    // Fetch/header/JSON errors can contain supplied values. Never forward them.
    console.error('BEADS_CLOUDFLARE_ACCESS_FAILED: verify GitHub sign-in or CI OIDC, repository policy, credential-file permissions and store reachability.');
    process.exitCode = 1;
  });
}
