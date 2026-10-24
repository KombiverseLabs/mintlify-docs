// Doppler routes of scripts/kombify-bootstrap.mjs (SECRETS-ACCESS-STANDARD.md
// §6c, DEVELOPMENT-ENVIRONMENT-STANDARD.md §5a). Every environment reaches
// Doppler through two independent routes, so one broken route never stops a
// session:
//
//   device (owner PC, worker devices): `device`, an API token of the service
//     account claude-cloud-env in the OS credential store, plus `broker`;
//   Claude cloud: `network`, the environment's api.doppler.com credential that
//     the proxy injects (its value never enters the VM), plus `broker`;
//   broker: the GitHub-OIDC broker (cloud-session-doppler.yml, account
//     claude-cloud-session), a separate identity on a separate transport.
//
// The signed-in Doppler CLI is an accelerator on the owner's PC, never a
// required route. claude-cloud-env holds the workplace role Owner (§14.1), so a
// device token lists and renews itself. Projected unchanged into every
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
    if (value?.token && value?.name) return { token: value.token, name: value.name, store };
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

export function writeDeviceToken({ name, token }, { platform = process.platform, run = spawnSync } = {}) {
  const secret = JSON.stringify({ name, token });
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

// --- Device token lifecycle -------------------------------------------------

async function accountSlug(token, fetchImpl) {
  const accounts = await dopplerCall(token, '/workplace/service_accounts?per_page=100', { fetchImpl });
  const slug = accounts.body?.service_accounts?.find((account) => account.name === STATIC_ACCOUNT)?.slug;
  if (!slug) throw new Error(`service account ${STATIC_ACCOUNT} not visible to the minting identity (HTTP ${accounts.status})`);
  return slug;
}

// Inventory of claude-cloud-env tokens (names, expiry, last use), read with any
// identity that may list service-account tokens (the account's own tokens may).
export async function staticTokens(token, fetchImpl = fetch) {
  const slug = await accountSlug(token, fetchImpl);
  const list = await dopplerCall(token, `/workplace/service_accounts/service_account/${slug}/tokens?per_page=100`, { fetchImpl });
  if (list.status !== 200) throw new Error(`token inventory of ${STATIC_ACCOUNT} answered HTTP ${list.status}`);
  return { slug, tokens: list.body?.api_tokens ?? [] };
}

export const daysLeft = (expiresAt, now = Date.now()) => (expiresAt ? Math.floor((Date.parse(expiresAt) - now) / DAY) : null);

// This device's token: ready, expiring (renew), rejected or missing.
export async function deviceTokenState({ read = readDeviceToken, fetchImpl = fetch, now = Date.now() } = {}) {
  const stored = read();
  if (!stored.token) return { status: 'missing', store: stored.store };
  const me = await dopplerCall(stored.token, '/me', { fetchImpl }).catch((error) => ({ status: error.cause?.code ?? 'unreachable' }));
  if (me.status !== 200) return { status: 'rejected', store: stored.store, name: stored.name, detail: `HTTP ${me.status}`, token: stored.token };
  let expiresAt = null;
  try { expiresAt = (await staticTokens(stored.token, fetchImpl)).tokens.find((t) => t.slug === me.body?.slug)?.expires_at ?? null; } catch { /* expiry unknown */ }
  const left = daysLeft(expiresAt, now);
  return { status: left !== null && left <= RENEW_WITHIN_DAYS ? 'expiring' : 'ready', store: stored.store, name: stored.name, expiresAt, daysLeft: left, token: stored.token };
}

// Mints this device's next token with an identity that may (the current device
// token, else the owner's CLI login), stores it, proves it from the store and
// revokes this device's older tokens. Returns names only.
export async function renewDeviceToken({ mintWith, host = hostname(), read = readDeviceToken, write = writeDeviceToken, fetchImpl = fetch, now = Date.now() } = {}) {
  if (!mintWith) throw new Error('no identity that may mint a device token (current device token or Doppler CLI login)');
  const slug = await accountSlug(mintWith, fetchImpl);
  const prefix = deviceTokenPrefix(host);
  const name = `${prefix}${new Date(now).toISOString().slice(0, 10).replaceAll('-', '')}${new Date(now).toISOString().slice(11, 16).replace(':', '')}`;
  const created = await dopplerCall(mintWith, `/workplace/service_accounts/service_account/${slug}/tokens`, { method: 'POST', body: { name, expires_at: new Date(now + DEVICE_TOKEN_DAYS * DAY).toISOString() }, fetchImpl });
  const token = created.body?.api_key;
  if (created.status !== 200 || !token) throw new Error(`minting ${name} answered HTTP ${created.status}`);
  let store;
  try {
    store = write({ name, token });
  } catch (error) {
    // Nothing holds the new token: revoke it again instead of leaving it behind.
    await dopplerCall(mintWith, `/workplace/service_accounts/service_account/${slug}/tokens/token/${created.body?.api_token?.slug}`, { method: 'DELETE', fetchImpl }).catch(() => {});
    throw error;
  }
  const back = read();
  const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
  if (back.name !== name || digest(back.token) !== digest(token)) throw new Error(`device token ${name} did not read back from ${store}`);
  if (await probeToken(back.token, fetchImpl) !== 200) throw new Error(`device token ${name} does not authenticate after storing`);
  const revoked = [];
  const tokens = (await staticTokens(back.token, fetchImpl)).tokens;
  // Exactly this device's stamped tokens: a host named `desk` must not match `device-desk-top-...`.
  const own = (candidate) => candidate.startsWith(prefix) && /^\d{12}$/.test(candidate.slice(prefix.length));
  for (const old of tokens.filter((t) => own(t.name) && t.name !== name)) {
    const gone = await dopplerCall(back.token, `/workplace/service_accounts/service_account/${slug}/tokens/token/${old.slug}`, { method: 'DELETE', fetchImpl });
    revoked.push(`${old.name}:${gone.status === 204 ? 'revoked' : `HTTP ${gone.status}`}`);
  }
  return { name, store, expiresAt: created.body?.api_token?.expires_at ?? null, revoked };
}
