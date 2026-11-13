// Doppler routes of scripts/kombify-bootstrap.mjs (SECRETS-ACCESS-STANDARD.md
// §6c, DEVELOPMENT-ENVIRONMENT-STANDARD.md §5a). Every environment reaches
// Doppler through two independent routes, so one broken route never stops a
// session:
//
//   device (owner PC, worker devices): `device`, a device-account API token in
//     the OS credential store (see "Device identities"), plus `broker`;
//   Claude cloud: `network`, the environment's api.doppler.com credential that
//     the proxy injects (its value never enters the VM), plus `broker`;
//   broker: the GitHub-OIDC broker (cloud-session-doppler.yml, account
//     claude-cloud-session), a separate identity on a separate transport.
//
// The signed-in Doppler CLI is an accelerator on the owner's PC, never a
// required route. Projected unchanged into every
// repository with kombify-bootstrap.mjs. Names and statuses only, never a value.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';

export const DOPPLER_API = 'https://api.doppler.com/v3';
export const STATIC_ACCOUNT = 'claude-cloud-env';
export const DEVICE_TOKEN_DAYS = 90;
export const RENEW_WITHIN_DAYS = 30;
const RESOURCE = 'kombify-doppler-device';
const FILE = join(homedir(), '.kombify', 'doppler-device-token.json');
const DAY = 86_400_000;

// Routes each host type needs ready; the CLI login is reported, never required.
export const REQUIRED_ROUTES = { device: ['device', 'broker'], cloud: ['network', 'broker'] };
export const hostType = (env = process.env) => (env.GITHUB_ACTIONS === 'true' ? 'ci' : env.CLAUDE_CODE_REMOTE === 'true' ? 'cloud' : 'device');
export const deviceTokenPrefix = (host = hostname()) => `device-${host.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')}-`;
export const disabledRoutes = (env = process.env) => new Set(String(env.KOMBIFY_DOPPLER_DISABLE ?? '').split(',').map((r) => r.trim()).filter(Boolean));

// Node's fetch honours HTTPS_PROXY only with NODE_USE_ENV_PROXY. In a Claude cloud
// session the api.doppler.com credential exists only behind the proxy, so a
// script that reads Doppler on its own runs itself again with it. Returns the
// child's exit code, or null when no re-run is needed.
export function rerunWithEnvProxy({ argv = process.argv, env = process.env, run = spawnSync } = {}) {
  if (!(env.HTTPS_PROXY || env.https_proxy) || env.NODE_USE_ENV_PROXY) return null;
  const child = run(process.execPath, ['--disable-warning=UNDICI-EHPA', ...argv.slice(1)], { stdio: 'inherit', env: { ...env, NODE_USE_ENV_PROXY: '1' } });
  return child.status ?? 1;
}

export async function dopplerCall(token, path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const headers = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
  const response = await fetchImpl(`${DOPPLER_API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) });
  let json = null;
  try { json = await response.json(); } catch { /* status decides */ }
  return { status: response.status, body: json };
}

// HTTP status of GET /me, or the transport error code. An empty token sends no
// Authorization header: in a cloud session the proxy adds the environment's credential.
export async function probeToken(token, fetchImpl = fetch) {
  try { return (await dopplerCall(token, '/me', { fetchImpl })).status; } catch (error) { return error.cause?.code ?? error.name ?? 'unreachable'; }
}

// --- OS credential store ---------------------------------------------------
// Windows Credential Manager (PasswordVault), Linux Secret Service; a 0600 file
// where none answers and on macOS, whose `security` CLI takes a password only
// as an argument (visible to other processes). The stored secret is
// {"name","token"} and reaches the store through stdin, never an argument.
const VAULT = "$ErrorActionPreference='Stop'; [void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]; $vault = New-Object Windows.Security.Credentials.PasswordVault;";
const quiet = { encoding: 'utf8', windowsHide: true, timeout: 20_000 };
// By its System32 path: PATH and the working directory are not trusted for the store.
const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const powershell = (run, script, input) => run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', `${VAULT} ${script}`], { ...quiet, input });

function parseStored(text, store) {
  try {
    const value = JSON.parse(text);
    if (value?.token && value?.name) return { token: value.token, name: value.name, expiresAt: value.expiresAt ?? null, account: value.account ?? null, store };
  } catch { /* unreadable entry */ }
  return { store, missing: true };
}

function readFileStore() {
  return existsSync(FILE) ? parseStored(readFileSync(FILE, 'utf8'), 'file') : { store: 'file', missing: true };
}

export function readDeviceToken({ platform = process.platform, run = spawnSync } = {}) {
  if (platform === 'win32') {
    const read = () => powershell(run, `$c = $vault.FindAllByResource('${RESOURCE}') | Select-Object -First 1; $c.RetrievePassword(); [Console]::Out.Write($c.Password)`);
    let result = read();
    // One retry for a transient failure; "Element not found" means there is no entry.
    if (result.status !== 0 && !/Element not found/i.test(String(result.stderr))) result = read();
    return result.status === 0 ? parseStored(result.stdout, 'windows-credential-manager') : { store: 'windows-credential-manager', missing: true };
  }
  if (platform === 'darwin') return readFileStore();
  const result = run('secret-tool', ['lookup', 'service', RESOURCE], quiet);
  if (result.status === 0 && result.stdout.trim()) return parseStored(result.stdout.trim(), 'secret-service');
  return readFileStore();
}

export function writeDeviceToken({ name, token, expiresAt = null, account = null }, { platform = process.platform, run = spawnSync } = {}) {
  const secret = JSON.stringify({ name, token, expiresAt, account });
  if (platform === 'win32') {
    const result = powershell(run, `$secret = [Console]::In.ReadToEnd(); foreach ($c in @($vault.RetrieveAll() | Where-Object { $_.Resource -eq '${RESOURCE}' })) { $vault.Remove($c) }; $vault.Add((New-Object Windows.Security.Credentials.PasswordCredential('${RESOURCE}', '${name}', $secret)))`, secret);
    if (result.status !== 0) throw new Error(`Windows Credential Manager refused the device token (${result.stderr.trim().split('\n')[0]})`);
    return 'windows-credential-manager';
  }
  const result = platform === 'darwin' ? { status: 1 } : run('secret-tool', ['store', '--label=kombify Doppler device token', 'service', RESOURCE], { ...quiet, input: secret });
  if (!result.error && result.status === 0) {
    rmSync(FILE, { force: true });
    return 'secret-service';
  }
  mkdirSync(dirname(FILE), { recursive: true, mode: 0o700 });
  writeFileSync(FILE, secret, { mode: 0o600 });
  return 'file';
}

// --- Device identities --------------------------------------------------------
// Only an admin device holds a token of the Owner account claude-cloud-env: the
// primary agent host and the owner's own PC. Every other machine holds a token
// of WORKER_ACCOUNT (workplace role None, Viewer on WORKER_PROJECT_ACCESS). That
// account can neither list nor mint tokens, so an administering identity mints
// a worker's token: renewDeviceToken on the machine with the CLI login or an
// administering token it still holds, else issueWorkerToken on an admin device,
// which hands the token to receiveDeviceToken on the worker through stdin.
export const WORKER_ACCOUNT = 'kombify-worker-device';
export const ADMIN_DEVICE_HOSTS = ['t3-code-ryzen', 'deskmarcel'];
export const WORKER_PROJECT_ACCESS = [
  { project: 'kombify-io', environments: ['prd'] },
  { project: 'kombination', environments: ['prd'] },
  { project: 'kombify-paperwork', environments: ['prd'] },
];
const hostKey = (host) => deviceTokenPrefix(host).slice('device-'.length, -1);
export const isAdminDevice = (host = hostname()) => ADMIN_DEVICE_HOSTS.includes(hostKey(host));
export const deviceAccount = (host = hostname()) => (isAdminDevice(host) ? STATIC_ACCOUNT : WORKER_ACCOUNT);
const issueHint = (host) => `an admin device issues it: node scripts/kombify-bootstrap.mjs doppler-routes --issue-for ${hostKey(host)} -- <command that runs \`node scripts/kombify-bootstrap.mjs doppler-routes --receive\` on ${hostKey(host)}>`;
const digest = (value) => createHash('sha256').update(String(value)).digest('hex');

async function accountSlug(token, fetchImpl, account = STATIC_ACCOUNT) {
  const accounts = await dopplerCall(token, '/workplace/service_accounts?per_page=100', { fetchImpl });
  const slug = accounts.body?.service_accounts?.find((entry) => entry.name === account)?.slug;
  if (!slug) throw new Error(`service account ${account} not visible to the minting identity (HTTP ${accounts.status})`);
  return slug;
}

async function accountTokens(token, account, fetchImpl = fetch) {
  const slug = await accountSlug(token, fetchImpl, account);
  const list = await dopplerCall(token, `/workplace/service_accounts/service_account/${slug}/tokens?per_page=100`, { fetchImpl });
  if (list.status !== 200) throw new Error(`token inventory of ${account} answered HTTP ${list.status}`);
  return { slug, tokens: list.body?.api_tokens ?? [] };
}

// Inventory of claude-cloud-env tokens (names, expiry, last use), read with any
// identity that may list service-account tokens.
export const staticTokens = (token, fetchImpl = fetch) => accountTokens(token, STATIC_ACCOUNT, fetchImpl);

// What a token's own metadata says: its name and, only where its role may list
// service accounts (an administering role), its account and workplace role.
export async function tokenIdentity(token, fetchImpl = fetch) {
  const me = await dopplerCall(token, '/me', { fetchImpl });
  if (me.status !== 200) return { status: me.status };
  const principal = me.body?.principal?.slug ?? null;
  const list = await dopplerCall(token, '/workplace/service_accounts?per_page=100', { fetchImpl });
  // Only a refusal proves a token does not administer; a throttled or failed read stays unknown.
  if (![200, 401, 403].includes(list.status)) throw new Error(`workplace administration of ${me.body?.name ?? 'the token'} unknown (HTTP ${list.status})`);
  const own = list.body?.service_accounts?.find((entry) => entry.slug === principal);
  return { status: 200, name: me.body?.name ?? null, tokenSlug: me.body?.slug ?? null, principal, administers: list.status === 200, listStatus: list.status, account: own?.name ?? null, role: own?.workplace_role?.name ?? null };
}

export const daysLeft = (expiresAt, now = Date.now()) => (expiresAt ? Math.floor((Date.parse(expiresAt) - now) / DAY) : null);

// This device's token: ready, expiring (renew), over-privileged (a worker that
// holds an administering token), rejected or missing.
export async function deviceTokenState({ read = readDeviceToken, fetchImpl = fetch, now = Date.now(), host = hostname() } = {}) {
  const stored = read();
  if (!stored.token) return { status: 'missing', store: stored.store };
  const id = await tokenIdentity(stored.token, fetchImpl).catch((error) => ({ status: error.cause?.code ?? 'unknown', detail: error.message }));
  if (id.status === 'unknown') return { status: 'unknown', store: stored.store, name: stored.name, detail: id.detail };
  if (id.status !== 200) return { status: 'rejected', store: stored.store, name: stored.name, detail: `HTTP ${id.status}`, token: stored.token };
  let expiresAt = stored.expiresAt ?? null;
  if (id.administers) {
    try {
      const list = await dopplerCall(stored.token, `/workplace/service_accounts/service_account/${id.principal}/tokens?per_page=100`, { fetchImpl });
      expiresAt = list.body?.api_tokens?.find((t) => t.slug === id.tokenSlug)?.expires_at ?? expiresAt;
    } catch { /* expiry from the store */ }
  }
  const left = daysLeft(expiresAt, now);
  const state = { store: stored.store, name: stored.name, expiresAt, daysLeft: left, token: stored.token, account: id.account ?? stored.account ?? null, role: id.role, administers: id.administers };
  if (id.administers && !isAdminDevice(host)) {
    return { ...state, status: 'over-privileged', detail: `${stored.name} belongs to ${id.account ?? 'an administering account'}${id.role ? ` (workplace role ${id.role})` : ''}; this worker holds only a ${WORKER_ACCOUNT} token: doppler-routes --repair re-mints it` };
  }
  return { ...state, status: left !== null && left <= RENEW_WITHIN_DAYS ? 'expiring' : 'ready' };
}

async function mintDeviceToken(mintWith, host, fetchImpl, now) {
  const account = deviceAccount(host);
  const slug = await accountSlug(mintWith, fetchImpl, account);
  const name = `${deviceTokenPrefix(host)}${new Date(now).toISOString().slice(0, 10).replaceAll('-', '')}${new Date(now).toISOString().slice(11, 16).replace(':', '')}`;
  const created = await dopplerCall(mintWith, `/workplace/service_accounts/service_account/${slug}/tokens`, { method: 'POST', body: { name, expires_at: new Date(now + DEVICE_TOKEN_DAYS * DAY).toISOString() }, fetchImpl });
  const token = created.body?.api_key;
  if (created.status !== 200 || !token) throw new Error(`minting ${name} in ${account} answered HTTP ${created.status}`);
  const revoke = () => dopplerCall(mintWith, `/workplace/service_accounts/service_account/${slug}/tokens/token/${created.body?.api_token?.slug}`, { method: 'DELETE', fetchImpl }).catch(() => {});
  return { name, token, account, expiresAt: created.body?.api_token?.expires_at ?? null, revoke };
}

// Revokes this host's other stamped tokens in both device accounts with the
// minting identity; the minting token itself, when it is one of them, goes last.
async function revokeOlderDeviceTokens(mintWith, host, keep, fetchImpl) {
  const prefix = deviceTokenPrefix(host);
  // Exactly this device's stamped tokens: a host named `desk` must not match `device-desk-top-...`.
  const own = (candidate) => candidate.startsWith(prefix) && /^\d{12}$/.test(candidate.slice(prefix.length));
  const self = (await dopplerCall(mintWith, '/me', { fetchImpl })).body?.slug;
  const doomed = [];
  for (const account of [STATIC_ACCOUNT, WORKER_ACCOUNT]) {
    let inventory;
    try { inventory = await accountTokens(mintWith, account, fetchImpl); } catch { continue; } // account not created yet
    for (const t of inventory.tokens.filter((entry) => own(entry.name) && entry.name !== keep)) doomed.push({ ...t, accountSlug: inventory.slug, account });
  }
  doomed.sort((a, b) => Number(a.slug === self) - Number(b.slug === self));
  const revoked = [];
  for (const old of doomed) {
    const gone = await dopplerCall(mintWith, `/workplace/service_accounts/service_account/${old.accountSlug}/tokens/token/${old.slug}`, { method: 'DELETE', fetchImpl });
    revoked.push(`${old.account}/${old.name}:${gone.status === 204 ? 'revoked' : `HTTP ${gone.status}`}`);
  }
  return revoked;
}

// Proves a token's identity before it is stored (on a worker it refuses an
// administering one), stores it and proves it from the store; restores the
// previous entry when storing or the proof from the store fails.
async function storeProven({ name, token, expiresAt, account }, { host, read, write, fetchImpl }) {
  if (!/^device-[a-z0-9-]+-\d{12}$/.test(name) || !name.startsWith(deviceTokenPrefix(host))) throw new Error(`device token name is not a stamped name for ${hostKey(host)}`);
  const id = await tokenIdentity(token, fetchImpl);
  if (id.status !== 200) throw new Error(`device token ${name} does not authenticate (HTTP ${id.status})`);
  if (id.administers && !isAdminDevice(host)) throw new Error(`device token ${name} administers the workplace; a worker holds only a ${WORKER_ACCOUNT} token`);
  const previous = read();
  const restore = () => { if (previous.token) write(previous); };
  let store;
  try {
    store = write({ name, token, expiresAt, account });
    const back = read();
    if (back.name !== name || digest(back.token) !== digest(token)) throw new Error(`device token ${name} did not read back from ${store}`);
    if (await probeToken(back.token, fetchImpl) !== 200) throw new Error(`device token ${name} does not authenticate after storing`);
  } catch (error) {
    try { restore(); } catch { /* the error below names the failed step */ }
    throw error;
  }
  return store;
}

// Mints this device's next token in its account (deviceAccount) with an
// identity that may, stores and proves it, and revokes this device's older
// tokens in both accounts. Returns names only.
export async function renewDeviceToken({ mintWith, host = hostname(), read = readDeviceToken, write = writeDeviceToken, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!mintWith) throw new Error(`no identity that may mint a device token (an administering device token or the Doppler CLI login)${isAdminDevice(host) ? '' : `; ${issueHint(host)}`}`);
  const minted = await mintDeviceToken(mintWith, host, fetchImpl, now);
  let store;
  try { store = await storeProven(minted, { host, read, write, fetchImpl }); } catch (error) { await minted.revoke(); throw error; }
  const revoked = await revokeOlderDeviceTokens(mintWith, host, minted.name, fetchImpl);
  return { name: minted.name, account: minted.account, store, expiresAt: minted.expiresAt, revoked };
}

// On an admin device: mints a worker's token and hands it to `deliver` (a
// command that runs receiveDeviceToken on the worker, the token on its stdin
// only). Revokes the worker's older tokens after the worker proved the new one,
// and the new one when it did not.
export async function issueWorkerToken({ mintWith, host, deliver, fetchImpl = fetch, now = Date.now() }) {
  if (!host) throw new Error('--issue-for needs the worker host name');
  if (isAdminDevice(host)) throw new Error(`${hostKey(host)} is an admin device; it renews its own token with doppler-routes --repair`);
  if (!mintWith) throw new Error('no administering identity on this host (device token or Doppler CLI login)');
  const minted = await mintDeviceToken(mintWith, host, fetchImpl, now);
  const { name, token, account, expiresAt } = minted;
  let delivered;
  try { delivered = await deliver(JSON.stringify({ name, token, expiresAt, account }), name); } catch (error) { delivered = { ok: false, detail: error.message }; }
  if (!delivered?.ok) {
    await minted.revoke();
    throw new Error(`${hostKey(host)} did not prove ${name} (${delivered?.detail ?? 'no receipt'}); the new token is revoked, the old one kept`);
  }
  return { name, account, expiresAt, revoked: await revokeOlderDeviceTokens(mintWith, host, name, fetchImpl) };
}

// On a worker: takes {name, token, expiresAt, account} from an admin device,
// refuses a token named for another host or one that administers the
// workplace, stores and proves it, keeping the previous entry on failure.
export async function receiveDeviceToken({ input, host = hostname(), read = readDeviceToken, write = writeDeviceToken, fetchImpl = fetch }) {
  let value;
  try { value = JSON.parse(String(input)); } catch { throw new Error('the handed-over device token is not readable'); }
  if (!value?.token || typeof value.name !== 'string' || value.name.length !== deviceTokenPrefix(host).length + 12 || !value.name.startsWith(deviceTokenPrefix(host))) throw new Error(`the handed-over token is not named for ${hostKey(host)}`);
  const store = await storeProven(value, { host, read, write, fetchImpl });
  return { name: value.name, store };
}
