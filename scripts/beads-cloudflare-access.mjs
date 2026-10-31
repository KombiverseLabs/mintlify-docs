#!/usr/bin/env node
// Canonical Kombify host adapter. The exchange implementation is projected from
// beads-cloudflare/cli/github-auth.mjs; repository configuration contains no keys.
// --check verifies held access without exchange, renewal, installation or metadata writes.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveGithubCredential, readGithubCredentials, updateCredentialFile, githubCredentialKey, githubCredentialFresh, throttledError } from './lib/beads-github-auth.mjs';
import { resolveHostGithubToken, describeTried, withoutTokenEnv } from './lib/github-host-identity.mjs';
import { ensureSessionTools } from './beads-session-tools.mjs';
import { admissionReaderCredential, appReaderCredential, trackerReaderMode } from './lib/beads-app-reader-auth.mjs';
import { brokerAvailable, brokerCredential } from './lib/beads-session-broker.mjs';
import { heldOauthCredential, oauthCredential } from './lib/beads-oauth-route.mjs';
import { accessFailureDiagnostic, trackerAccessCode } from './lib/beads-access-diagnostics.mjs';

const root = resolve(import.meta.dirname, '..');
// This adapter is part of the trusted Kombify bootstrap, not an arbitrary URL
// supplied by a checked-out feature branch. Other installations use the OSS CLI.
const trustedOrigin = 'https://beads-cloudflare.soulcreek.workers.dev';
function credentialFile(env = process.env) {
  const home = process.platform === 'win32' ? env.APPDATA : process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support') : env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return home && join(home, 'beads-cloudflare', 'credentials.json');
}
export async function access(config, { allowStatic = false, env = process.env, fetchImpl = fetch, cacheFile = credentialFile(env),
  broker = { available: brokerAvailable, credential: brokerCredential }, hostIdentity = resolveHostGithubToken,
  oauth = oauthCredential, interactive = false, readOnly = false } = {}) {
  if (config.base !== trustedOrigin || !/^KombiverseLabs\/[A-Za-z0-9_.-]+$/.test(config.github_repository)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.tracker)) throw new Error('Invalid Kombify tracker binding');
  const file = cacheFile;
  const readerMode = trackerReaderMode(env);
  const appReader = Boolean(readerMode);
  const credentials = !appReader && file && existsSync(file) ? readGithubCredentials(file) : {};
  const machineKey = !appReader && allowStatic && env.BEADS_CLOUDFLARE_TOKEN;
  if (machineKey && !/^[!-~]+$/.test(machineKey)) throw new Error('Machine tracker credential is malformed');
  const github = (identityEnv = env) => resolveGithubCredential({ base: config.base, repository: config.github_repository,
    tracker: config.tracker, credentials,
    env: { ...identityEnv, BEADS_CLOUDFLARE_TRUSTED_ORIGINS: trustedOrigin }, fetchImpl });
  // A revoked gh login or GH_TOKEN (GitHub keeps ten OAuth tokens per user, so a
  // login elsewhere revokes the oldest) falls through to the next valid host
  // identity: env token, gh login, then the Doppler custody PAT (A4, 2026-10-16).
  // A throttled identity is reported with its reset; nothing prompts for a login.
  const viaHost = async (error) => {
    if (!['GITHUB_IDENTITY_INVALID', 'GITHUB_IDENTITY_MISSING'].includes(error.code) || env.ACTIONS_ID_TOKEN_REQUEST_URL) throw error;
    const host = await hostIdentity({ env, fetchImpl });
    if (host.state === 'throttled') throw throttledError(host.reset);
    if (host.state !== 'valid') throw Object.assign(new Error(`No valid GitHub identity on this host (${describeTried(host.tried) || 'none found'})`), { code: error.code });
    return { ...(await github({ ...withoutTokenEnv(env), GH_TOKEN: host.token })), identity_source: host.source, route: 'github-host' };
  };
  // A proxy-held GitHub identity (Claude cloud sessions) cannot be exchanged
  // directly; the repository's OIDC session workflow issues the credential.
  // Without any GitHub route the user's OAuth sign-in to the Worker serves
  // (H2, 2026-10-17); a host without one is pointed at the kombify-Beads connector.
  const viaGithub = async () => {
    try { const held = await github(); return { ...held, route: held.cached ? 'cache' : 'github' }; }
    catch (error) {
      let failure = error;
      try { return await viaHost(error); } catch (fallback) { failure = fallback; }
      if (broker.available(env)) {
        try { return { ...(await broker.credential(config)), route: 'broker' }; } catch (brokered) { failure = brokered; }
      }
      if (env.ACTIONS_ID_TOKEN_REQUEST_URL || env.GITHUB_ACTIONS) throw failure;
      try { return await oauth(config.base, { cacheFile, fetchImpl, interactive }); }
      // A throttled identity keeps its reset; an attended sign-in reports its own failure;
      // any other dead end names the connector route.
      catch (signIn) { throw interactive || (signIn.code === 'MCP_CONNECTOR_REQUIRED' && failure.code !== 'GITHUB_THROTTLED') ? signIn : failure; }
    }
  };
  let entry;
  if (readOnly) {
    // Reuse a still-valid credential even past its proactive renewal time.
    // Inspection never exchanges GitHub/OIDC/App identity or rotates OAuth tokens.
    const held = credentials[config.base]?.github?.[githubCredentialKey(config.github_repository, config.tracker)];
    const heldOauth = heldOauthCredential(credentials, config.base);
    if (machineKey) entry = { token: machineKey, expires_at: null, static: true, route: 'machine-key' };
    else if (githubCredentialFresh(held)) entry = { ...held, cached: true, route: 'cache' };
    else if (heldOauth) entry = { ...heldOauth, cached: true };
    else throw Object.assign(new Error('No usable cached tracker credential; run bootstrap to repair'), { code: 'READ_ONLY_CREDENTIAL_PENDING' });
  } else entry = appReader ? { ...(await (readerMode === 'admission-reader' ? admissionReaderCredential : appReaderCredential)(config, { env, fetchImpl })), route: readerMode }
    : machineKey ? { token: machineKey, expires_at: null, static: true, route: 'machine-key' } : await viaGithub();
  const response = await fetchImpl(`${config.base}/t/${config.tracker}/v0/beads/context`, {
    headers: { Authorization: `Bearer ${entry.token}` }, redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error('Tracker context refused'), { code: trackerAccessCode(response.status), route: entry.route, status: response.status });
  }
  const context = await response.json();
  // OAuth custody stays in its own namespace; it is never a repository exchange key.
  if (!readOnly && !appReader && entry.route !== 'oauth' && file && (!entry.cached || credentials[config.base]?.github_trusted !== true)) await updateCredentialFile(file, doc => {
    doc[config.base] = { ...doc[config.base], github_trusted: true, ...(!entry.static ? { github: { ...doc[config.base]?.github,
      [githubCredentialKey(config.github_repository, config.tracker)]: { token: entry.token, expires_at: entry.expires_at,
        ...(entry.renew_at ? { renew_at: entry.renew_at } : {}) } } } : {}) };
    return doc;
  });
  return { ...entry, project_id: context.project_id };
}
// Native Cloudflare bootstrap never opens a local database or imports history.
export function bootstrapCloudflare(config, repositoryRoot = root, { projectId } = {}) {
  if (config.authority !== 'cloudflare') return;
  const workspaceAlias = config.github_repository === 'KombiverseLabs/kombify-Cloud' && config.tracker === 'kombify-workspace';
  if (workspaceAlias && (typeof projectId !== 'string' || !projectId.trim())) throw new Error('Workspace alias needs authenticated project identity');
  const beads = join(repositoryRoot, '.beads');
  mkdirSync(beads, { recursive: true });
  const metadataFile = join(beads, 'metadata.json');
  const current = existsSync(metadataFile) ? JSON.parse(readFileSync(metadataFile, 'utf8')) : {};
  if (current.backend && current.backend !== 'cloudflare') throw new Error('Archive the retired local tracker before native Cloudflare bootstrap; no conversion or import was attempted');
  const redirectFile = join(beads, 'redirect');
  if (workspaceAlias && existsSync(redirectFile)) {
    const target = resolve(repositoryRoot, readFileSync(redirectFile, 'utf8').trim());
    if (target !== resolve(repositoryRoot, '..', '.beads')) throw new Error('Workspace alias redirect is not canonical');
    const binding = JSON.parse(readFileSync(resolve(target, '..', '.kombify', 'beads-cloudflare.json'), 'utf8'));
    const native = JSON.parse(readFileSync(join(target, 'cloudflare.json'), 'utf8'));
    const metadata = JSON.parse(readFileSync(join(target, 'metadata.json'), 'utf8'));
    if (binding.authority !== 'cloudflare' || binding.github_repository !== 'KombiverseLabs/kombify-workspace'
        || binding.base !== config.base || binding.tracker !== config.tracker
        || native.base !== config.base || native.tracker !== config.tracker || metadata.backend !== 'cloudflare'
        || !projectId || metadata.project_id !== projectId) throw new Error('Workspace alias native identity does not match authenticated context');
    return; // Keep only the authenticated canonical shared tracker route.
  }
  if (workspaceAlias && current.project_id && current.project_id !== projectId) throw new Error('Workspace alias predecessor needs its canonical redirect');
  const atomic = (file, value) => {
    const staged = `${file}.${randomUUID()}.tmp`;
    try { writeFileSync(staged, JSON.stringify(value, null, 2)+'\n', { flag: 'wx' }); renameSync(staged, file); }
    finally { rmSync(staged, { force: true }); }
  };
  atomic(join(beads, 'cloudflare.json'), { backend: 'cloudflare', base: config.base, tracker: config.tracker,
    github_repository: config.github_repository, token_env: 'BEADS_CLOUDFLARE_TOKEN' });
  // The pinned upstream bd codec requires database:'dolt'; this is not a local backend.
  atomic(metadataFile, { backend: 'cloudflare', database: 'dolt', ...(projectId || current.project_id ? { project_id: projectId || current.project_id } : {}) });
  // bd resolves this legacy redirect before consulting metadata. Retire only
  // the local pointer after the validated repository binding is complete.
  rmSync(join(beads, 'redirect'), { force: true });
}
async function main(args) {
  const internal = args.includes('--credential');
  const check = args.includes('--check');
  if (check && (internal || args.includes('--sign-in'))) throw new Error('--check cannot issue a credential or sign in');
  const config = internal ? JSON.parse(readFileSync(0, 'utf8'))
    : JSON.parse(readFileSync(join(root, '.kombify', 'beads-cloudflare.json'), 'utf8'));
  // Only a direct, attended invocation may open a browser; the writer's --credential pipe never does.
  const interactive = !check && !internal && (args.includes('--sign-in') || Boolean(process.stdin.isTTY && process.stderr.isTTY));
  const entry = await access(config, { allowStatic: !internal, interactive, readOnly: check });
  if (!internal && !check) {
    if (await ensureSessionTools() !== 0) throw new Error('Pinned native Cloudflare bd could not be provisioned');
    bootstrapCloudflare(config, root, { projectId: entry.project_id });
  }
  // --credential is a pipe protocol used only by the governed writer; normal
  // invocations never print a token or ask an operator to copy one.
  console.log(internal ? JSON.stringify(entry) : `BEADS_CLOUDFLARE_ACCESS_OK repository=${config.github_repository} tracker=${config.tracker} route=${entry.route ?? 'github'}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Node's fetch honours HTTPS_PROXY only with NODE_USE_ENV_PROXY. Behind an
  // agent proxy (any cloud session, any account) this entry point turns it on
  // itself, so no environment variable has to be configured anywhere.
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    const child = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
    process.exit(child.status ?? 1);
  }
  await main(process.argv.slice(2)).catch((error) => {
    // Fetch/header/JSON errors can contain supplied values. Never forward them;
    // only the fixed classification code and an ISO reset time are printed.
    const known = ['GITHUB_THROTTLED', 'GITHUB_IDENTITY_INVALID', 'GITHUB_IDENTITY_MISSING', 'GITHUB_EXCHANGE_REFUSED', 'MCP_CONNECTOR_REQUIRED', 'READ_ONLY_CREDENTIAL_PENDING'];
    const kind = known.includes(error?.code) ? ` class=${error.code}` : '';
    const reset = error?.code === 'GITHUB_THROTTLED' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(error.reset ?? '') ? ` retry_after=${error.reset}` : '';
    const advice = error?.code === 'READ_ONLY_CREDENTIAL_PENDING' ? 'inspection found no usable cached credential; run node scripts/beads-cloudflare-access.mjs to prepare access.'
      : error?.code === 'GITHUB_THROTTLED' ? 'the GitHub identity is valid but throttled; retry after the reset, do not sign in again.'
      : error?.code === 'MCP_CONNECTOR_REQUIRED' ? `no GitHub route and no OAuth sign-in here; in a cloud session use the kombify-Beads connector (${trustedOrigin}/mcp) and its beads_* tools, on a device rerun with --sign-in.`
      : 'verify GitHub sign-in or CI OIDC, repository policy, credential-file permissions and store reachability.';
    console.error(accessFailureDiagnostic(error));
    process.exitCode = 1;
  });
}
