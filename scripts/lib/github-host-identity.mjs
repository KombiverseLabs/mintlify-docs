// Passive GitHub identity lookup: environment tokens, then the host's gh login.
// Repair is explicit through kombify-up or credential-health, which install the
// company App session. Lookup never reads personal-token custody or mints tokens.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Env-only Git credential helper: answers `get` from KOMBIFY_GIT_TOKEN, ignores store/erase.
export const ENV_GIT_HELPER = '!f() { test "$1" = get || exit 0; echo username=x-access-token; echo "password=$KOMBIFY_GIT_TOKEN"; }; f';

const shape = (value) => typeof value === 'string' && /^[!-~]{20,}$/.test(value);
const quiet = { encoding: 'utf8', windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] };

export function withoutTokenEnv(env) {
  const clean = { ...env };
  delete clean.GH_TOKEN; delete clean.GITHUB_TOKEN;
  return clean;
}

/** Reads the gh login of this host, ignoring GH_TOKEN/GITHUB_TOKEN. */
export function ghStoredToken({ env = process.env, run = spawnSync } = {}) {
  const result = run('gh', ['auth', 'token', '--hostname', 'github.com'], { ...quiet, env: { ...withoutTokenEnv(env), GH_PROMPT_DISABLED: '1' }, timeout: 10_000 });
  const token = !result.error && result.status === 0 ? String(result.stdout ?? '').trim() : '';
  return shape(token) ? token : '';
}

/** Held identities only, in order. No custody or issuance side effects. */
export function* hostGithubTokens({ env = process.env, run = spawnSync } = {}) {
  const seen = new Set();
  const fresh = (token) => token && !seen.has(token) && seen.add(token);
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    const token = String(env[name] ?? '').trim();
    if (shape(token) && fresh(token)) yield { source: `env:${name}`, token };
  }
  const gh = ghStoredToken({ env, run });
  if (fresh(gh)) yield { source: 'gh', token: gh };
}

/**
 * valid | invalid (401) | throttled (primary or secondary limit, with reset) |
 * refused (other HTTP status) | transport. /rate_limit does not spend the budget.
 */
export async function classifyGithubToken(token, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl('https://api.github.com/rate_limit', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'kombify-host-identity' },
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
  } catch { return { state: 'transport' }; }
  const header = (name) => response.headers?.get?.(name) ?? null;
  const scopes = String(header('x-oauth-scopes') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const iso = (seconds) => (Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);
  if (response.status === 401) return { state: 'invalid', status: 401 };
  if ((response.status === 403 || response.status === 429) && (header('x-ratelimit-remaining') === '0' || header('retry-after'))) {
    const retry = Number(header('retry-after'));
    return { state: 'throttled', status: response.status, reset: iso(Number(header('x-ratelimit-reset'))) ?? (Number.isFinite(retry) ? new Date(Date.now() + retry * 1000).toISOString() : null) };
  }
  if (!response.ok) return { state: 'refused', status: response.status };
  let core;
  try { core = (await response.json())?.resources?.core; } catch { /* body is optional */ }
  if (core?.remaining === 0) return { state: 'throttled', status: 200, reset: iso(core.reset), scopes };
  return { state: 'valid', status: 200, scopes };
}

/**
 * First usable identity. A throttled one is returned as such (the same user's
 * other tokens share its budget, so falling through would not help). Only an
 * invalid (401) identity is skipped; a refusal or transport failure stops lookup.
 */
export async function resolveHostGithubToken({ env = process.env, run = spawnSync, fetchImpl = fetch, skip = [] } = {}) {
  const tried = [];
  for (const candidate of hostGithubTokens({ env, run })) {
    if (skip.includes(candidate.token)) { tried.push({ source: candidate.source, state: 'invalid' }); continue; }
    const verdict = await classifyGithubToken(candidate.token, { fetchImpl });
    if (verdict.state === 'valid' || verdict.state === 'throttled') return { ...candidate, ...verdict, tried };
    tried.push({ source: candidate.source, state: verdict.state, ...(verdict.status ? { status: verdict.status } : {}) });
    if (verdict.state !== 'invalid') return { state: verdict.state, ...(verdict.status ? { status: verdict.status } : {}), tried };
  }
  return { state: tried.length ? 'invalid' : 'missing', tried, repair: 'node scripts/kombify-up.mjs --only github-identity' };
}

export const describeTried = (tried) => tried.map((t) => `${t.source}=${t.state}${t.status ? `(${t.status})` : ''}`).join(', ');

/** gh's configuration directory (GH_CONFIG_DIR, else the platform default). */
export function ghConfigDir(env = process.env) {
  if (env.GH_CONFIG_DIR) return env.GH_CONFIG_DIR;
  if (process.platform === 'win32' && env.APPDATA) return join(env.APPDATA, 'GitHub CLI');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'gh');
}

// Windows Credential Manager entries exactly as gh (go-keyring/wincred) writes
// them: generic credentials "gh:github.com:<login>" and "gh:github.com:", UTF-8
// blob, local-machine persistence. The value arrives on stdin, never in argv.
const WINCRED_WRITE = `$ErrorActionPreference='Stop'
$token = [Console]::In.ReadToEnd().Trim()
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class KombifyGhKeyring {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct Credential { public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;
    public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredWrite(ref Credential credential, uint flags);
  public static void Write(string target, string user, string secret) {
    byte[] blob = Encoding.UTF8.GetBytes(secret);
    var c = new Credential { Type = 1, TargetName = target, UserName = user, Persist = 2, CredentialBlobSize = (uint)blob.Length };
    c.CredentialBlob = Marshal.AllocHGlobal(blob.Length);
    try { Marshal.Copy(blob, 0, c.CredentialBlob, blob.Length);
      if (!CredWrite(ref c, 0)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
    finally { Marshal.FreeHGlobal(c.CredentialBlob); }
  }
}
'@
[KombifyGhKeyring]::Write("gh:github.com:$env:KOMBIFY_GH_LOGIN", $env:KOMBIFY_GH_LOGIN, $token)
[KombifyGhKeyring]::Write("gh:github.com:", "", $token)`;

const hostsYaml = (login, token) => `github.com:\n    users:\n        ${login}:${token ? `\n            oauth_token: ${token}` : ''}\n    git_protocol: https\n${token ? `    oauth_token: ${token}\n` : ''}    user: ${login}\n`;

/**
 * Installs a validated token as this host's gh login without a browser. gh's own
 * `auth login --with-token` comes first; if its scope checks refuse the token,
 * the store is then written the way gh writes it: the
 * Windows keyring when hosts.yml holds no plaintext token, else hosts.yml
 * (gh's insecure storage, the default on hosts without a keyring).
 * `insecureStorage` (the short-lived kombify-ci session token of a cloud
 * session) writes hosts.yml directly on every platform and never touches a
 * keyring: gh's own login clears the keyring's active slot when it switches
 * accounts, and behind the cloud proxy its GraphQL login lookup is refused.
 */
export function installGhToken({ token, login, env = process.env, run = spawnSync, platform = process.platform, insecureStorage = false }) {
  if (!shape(token) || !/^[A-Za-z0-9-]{1,39}(\[bot\])?$/.test(login ?? '')) return { ok: false, route: 'none', error: 'token or login malformed' };
  const clean = { ...withoutTokenEnv(env), GH_PROMPT_DISABLED: '1' };
  const native = insecureStorage ? { status: null } : run('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--with-token'], { encoding: 'utf8', input: token, env: clean, timeout: 30_000, windowsHide: true, shell: false });
  if (!native.error && native.status === 0) return { ok: true, route: 'gh auth login --with-token' };
  const refusal = /missing required scope '([^']+)'/.exec(String(native.stderr ?? ''))?.[1];
  const dir = ghConfigDir(env);
  const hostsFile = join(dir, 'hosts.yml');
  const current = existsSync(hostsFile) ? readFileSync(hostsFile, 'utf8') : '';
  const otherHosts = current.split(/\r?\n/).some((line) => /^[^\s#][^:]*:\s*$/.test(line) && !/^github\.com:\s*$/.test(line));
  if (otherHosts) return { ok: false, route: 'none', error: `gh refused (${refusal ? `missing ${refusal}` : 'login failed'}) and hosts.yml holds other hosts; not rewritten` };
  const plaintext = /^\s+oauth_token:/m.test(current);
  mkdirSync(dir, { recursive: true });
  if (platform === 'win32' && !plaintext && !insecureStorage) {
    const ps = join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const psEnv = { ...clean, KOMBIFY_GH_LOGIN: login };
    delete psEnv.PSModulePath; // PowerShell 7's module path breaks the inbox 5.1 host.
    const written = run(ps, ['-NoProfile', '-NonInteractive', '-Command', WINCRED_WRITE], { encoding: 'utf8', input: token, env: psEnv, timeout: 60_000, windowsHide: true, shell: false });
    if (written.error || written.status !== 0) return { ok: false, route: 'windows-keyring', error: `keyring write failed (exit ${written.status ?? written.error?.code})` };
    writeFileSync(hostsFile, hostsYaml(login, ''), { mode: 0o600 });
    chmodSync(hostsFile, 0o600);
    return { ok: true, route: `windows-keyring${refusal ? ` (gh login refused: missing ${refusal})` : ''}` };
  }
  writeFileSync(hostsFile, hostsYaml(login, token), { mode: 0o600 });
  chmodSync(hostsFile, 0o600); // an existing file keeps its mode on write
  return { ok: true, route: `gh hosts.yml insecure storage${refusal ? ` (gh login refused: missing ${refusal})` : ''}` };
}
