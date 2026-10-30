#!/usr/bin/env node
// The one development bootstrap of every Kombify repository
// (SECRETS-ACCESS-STANDARD.md §6c, DEVELOPMENT-ENVIRONMENT-STANDARD.md §2). Canonical in
// kombify-workspace; repo-context-sync.mjs projects it unchanged into each
// repository as scripts/kombify-bootstrap.mjs. It sets up, in any environment,
// what a session needs to install, build, test and run the repository:
//
// - Go: private github.com/KombiverseLabs/* modules (GOPRIVATE, GONOSUMDB).
// - npm: the @kombiverselabs/@kombify scopes in the user npmrc, reading
//   ${NODE_AUTH_TOKEN} (pnpm >= 11.5.3 ignores a project .npmrc token).
// - Doppler: access to the repository's own scope from .kombify/secrets.json
//   or doppler.yaml, along two independent routes per environment
//   (lib/doppler-routes.mjs), each token proven before use so a dead one
//   falls through to the next:
//     1. DOPPLER_TOKEN already set (dev container from the host, a parent `run`);
//     2. the Doppler CLI signed in on this host (accelerator, never required);
//     3. GitHub Actions: none; CI uses OIDC or its repository secrets (§4);
//     4. a device: the device token in the OS credential store;
//     5. a cached GitHub-OIDC broker token;
//     6. a Claude cloud session: the environment's api.doppler.com credential,
//        which the proxy injects (no value in the VM);
//     7. any host whose gh acts as an owner identity: a fresh grant of the
//        GitHub-OIDC broker of kombify-workspace (cloud-doppler-session.mjs, §6b);
//     8. an interactive terminal with the Doppler CLI: `doppler login`.
//   KOMBIFY_DOPPLER_DISABLE=cli,device (any route names) switches routes off.
// - Package token: NODE_AUTH_TOKEN when set; in a cloud session the broker's
//   read-only packages grant; elsewhere Doppler kombify-io/prd_gateway
//   GITHUB_PACKAGES_READ_TOKEN through the access above. It reaches only the
//   install command and is never written to disk.
//
//   node scripts/kombify-bootstrap.mjs            # set up + verify, exit 1 on a gap
//   node scripts/kombify-bootstrap.mjs --hook     # same, never fails, no broker dispatch
//   node scripts/kombify-bootstrap.mjs --check    # inspect without configuration writes or credential renewal
//   node scripts/kombify-bootstrap.mjs --install  # also pnpm install --frozen-lockfile
//                                                 # (no token at all where packages are vendored, §6d)
//   node scripts/kombify-bootstrap.mjs run -- <cmd...>   # cmd with the repo's Doppler secrets
//   node scripts/kombify-bootstrap.mjs doppler-routes [--live] [--repair] [--json]
//                                                 # both routes of this host; --live proves the
//                                                 # broker with a fresh grant, --repair mints or
//                                                 # renews this device's token
//   node scripts/kombify-bootstrap.mjs packages -- <cmd...>  # cmd with NODE_AUTH_TOKEN
//   node scripts/kombify-bootstrap.mjs rules     # the owner's rules (also printed by --hook)
//   node scripts/kombify-bootstrap.mjs mcp --mcp-host codex --install # repair + prove selected native staff MCP
//   node scripts/kombify-bootstrap.mjs context   # obtain/refresh and install Agent Home
//   node scripts/kombify-bootstrap.mjs context --check  # inspect without installation
//
// - Owner rules: `standards/rules.md` of Soulcreek/agent-home, from this
//   device's Agent Home checkout (fast-forwarded on a clean main), else from
//   GitHub through gh, else from the last cached copy. A Claude cloud session
//   whose git proxy refuses the unattached repository installs Agent Home
//   from a sealed bundle of main the broker workflow hands it (`context`,
//   grant agent-home), and kombify-up prints the rules after that step.
//   flags: --project P --config C override the repository scope.
//
// Prints names, sources and statuses only, never a secret value.
// KOMBIFY_BOOTSTRAP_SKIP=1 disables it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareAgentHome } from './lib/agent-home-bootstrap.mjs';
import { prepareStaffMcp } from './lib/staff-mcp-bootstrap.mjs';
import { ENV_GIT_HELPER, hostGithubTokens } from './lib/github-host-identity.mjs';
import { DOPPLER_API, REQUIRED_ROUTES, deviceTokenState, disabledRoutes, hostType, probeToken, readDeviceToken, renewDeviceToken } from './lib/doppler-routes.mjs';

const SELF = fileURLToPath(import.meta.url);
export const ROOT = resolve(dirname(SELF), '..');
export { DOPPLER_API };
export const REGISTRY = 'https://npm.pkg.github.com';
export const PRIVATE_GO = 'github.com/KombiverseLabs/*';
export const PACKAGES_SECRET = { project: 'kombify-io', config: 'prd_gateway', name: 'GITHUB_PACKAGES_READ_TOKEN' };
export const NPMRC_LINES = [
  `@kombiverselabs:registry=${REGISTRY}`,
  `@kombify:registry=${REGISTRY}`,
  '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}',
];
const BROKER_REPO = 'KombiverseLabs/kombify-workspace';
const BROKER_FILE = 'scripts/cloud-doppler-session.mjs';
const BROKER_MAX_AGE_MS = 12 * 60 * 60_000;

// Adds only the missing keys, so a workstation's own token line is kept.
export function mergeNpmrc(current) {
  const key = (line) => line.split('=')[0].trim();
  const present = new Set(current.split('\n').filter((line) => line.trim()).map(key));
  const missing = NPMRC_LINES.filter((line) => !present.has(key(line)));
  if (!missing.length) return current;
  const base = current && !current.endsWith('\n') ? `${current}\n` : current;
  return `${base}${missing.join('\n')}\n`;
}

// Repository scope: flags, then .kombify/secrets.json, then doppler.yaml.
export function resolveScope({ root = ROOT, argv = [], read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null) } = {}) {
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (flag('--project') && flag('--config')) return { project: flag('--project'), config: flag('--config'), from: 'flags' };
  const marker = read(join(root, '.kombify', 'secrets.json'));
  if (marker) {
    const token = JSON.parse(marker).one_token ?? {};
    if (token.doppler_project && token.doppler_config) {
      return { project: token.doppler_project, config: token.doppler_config, from: '.kombify/secrets.json' };
    }
  }
  const yaml = read(join(root, 'doppler.yaml'));
  if (yaml) {
    const project = yaml.match(/^\s*project:\s*["']?([\w.-]+)/m)?.[1];
    const config = yaml.match(/^\s*config:\s*["']?([\w.-]+)/m)?.[1];
    if (project && config) return { project, config, from: 'doppler.yaml' };
  }
  return null;
}

function cliToken(root) {
  const result = spawnSync('doppler', ['configure', 'get', 'token', '--plain', '--scope', root], { encoding: 'utf8' });
  if (result.error) return { missing: true };
  const token = result.status === 0 ? result.stdout.trim() : '';
  return token ? { token } : {};
}

export async function loadBroker({ qualified = false, readOnly = false } = {}) {
  if (qualified) {
    const git = args => spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', windowsHide: true, timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const remote = git(['remote', 'get-url', 'origin']);
    let revision, bytes, blob;
    if (remote.status === 0 && [`https://github.com/${BROKER_REPO}.git`, `https://github.com/${BROKER_REPO}`, `git@github.com:${BROKER_REPO}.git`].includes(remote.stdout.trim())) {
      const head = git(['rev-parse', 'HEAD']), upstream = git(['rev-parse', 'origin/main']);
      if (head.status !== 0 || upstream.status !== 0 || head.stdout !== upstream.stdout || git(['branch', '--show-current']).stdout.trim() !== 'main' || git(['status', '--porcelain', '--', BROKER_FILE]).stdout.trim()) throw new Error('mcp_github_session_source_unsettled');
      revision = head.stdout.trim(); bytes = git(['show', `${revision}:${BROKER_FILE}`]).stdout;
      blob = git(['rev-parse', `${revision}:${BROKER_FILE}`]).stdout.trim();
    } else {
      const gh = args => { const r = spawnSync('gh', ['api', ...args], { encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] }); if (r.status !== 0) throw new Error('mcp_github_session_source_unavailable'); return r.stdout; };
      revision = gh([`repos/${BROKER_REPO}/git/ref/heads/main`, '--jq', '.object.sha']).trim();
      if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('mcp_github_session_source_unverified');
      const source = JSON.parse(gh([`repos/${BROKER_REPO}/contents/${BROKER_FILE}?ref=${revision}`]));
      if (source.type !== 'file' || source.encoding !== 'base64') throw new Error('mcp_github_session_source_unverified');
      bytes = Buffer.from(source.content, 'base64').toString('utf8'); blob = source.sha;
    }
    const data = Buffer.from(bytes ?? '');
    if (!/^[0-9a-f]{40}$/.test(revision ?? '') || createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex') !== blob || !bytes.includes('export async function login')) throw new Error('mcp_github_session_source_unverified');
    const path = join(homedir(), '.kombify', 'cloud-doppler-session.mjs');
    if (readOnly) {
      const local = join(ROOT, BROKER_FILE);
      const held = [local, path].find(candidate => existsSync(candidate) && readFileSync(candidate).equals(data));
      if (!held) throw new Error('mcp_github_session_source_inspection_pending');
      const module = await import(`${pathToFileURL(held).href}?source=${revision}`);
      if (typeof module.readCache !== 'function' || typeof module.login !== 'function') throw new Error('mcp_github_session_source_unverified');
      return { ...module, source: { repository: BROKER_REPO, revision, git_blob: blob, sha256: createHash('sha256').update(data).digest('hex'), path: held } };
    }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, data, { mode: 0o600 });
    const module = await import(`${pathToFileURL(path).href}?source=${revision}`);
    if (typeof module.readCache !== 'function' || typeof module.login !== 'function') throw new Error('mcp_github_session_source_unverified');
    return { ...module, source: { repository: BROKER_REPO, revision, git_blob: blob, sha256: createHash('sha256').update(data).digest('hex'), path } };
  }
  const local = join(ROOT, BROKER_FILE);
  if (existsSync(local)) return import(pathToFileURL(local).href);
  const cached = join(homedir(), '.kombify', 'cloud-doppler-session.mjs');
  const fresh = existsSync(cached) && Date.now() - statSync(cached).mtimeMs < BROKER_MAX_AGE_MS;
  if (readOnly) {
    if (!fresh) throw new Error('broker source is absent or stale; run bootstrap to repair');
    return import(pathToFileURL(cached).href);
  }
  if (!fresh) {
    const result = spawnSync('gh', ['api', `repos/${BROKER_REPO}/contents/${BROKER_FILE}`, '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout.includes('export async function login')) {
      if (!existsSync(cached)) throw new Error(`could not fetch ${BROKER_FILE} from ${BROKER_REPO} with gh`);
    } else {
      mkdirSync(dirname(cached), { recursive: true, mode: 0o700 });
      writeFileSync(cached, result.stdout, { mode: 0o600 });
    }
  }
  return import(`${pathToFileURL(cached).href}?t=${Date.now()}`);
}

const AGENT_HOME_REPO = 'Soulcreek/agent-home';
const OWNER_RULES_PATH = 'standards/rules.md';
const OWNER_RULES_CACHE = join(homedir(), '.kombify', 'owner-rules.md');

const authFailure = (result) => /auth|credential|Invalid username|could not read Username|Bad credentials|\b40[13]\b|denied/i.test(String(result.stderr ?? ''));

// Non-interactive fast-forward (A4, 2026-10-16): each host identity in order
// (env token, gh login, Doppler custody PAT) through an env-only credential
// helper, so a stale credential-manager entry or a revoked gh login neither
// fails the session start nor opens a sign-in prompt. Fetch then merge the
// tracking ref: `git pull` merges FETCH_HEAD, which a concurrent session's
// fetch can leave holding several branches ("multiple branches").
export function fastForwardAgentHome(root, { run = spawnSync, env = process.env } = {}) {
  const base = { ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' };
  const git = (config, args, extra = {}) => run('git', ['-C', root, ...config, ...args], { encoding: 'utf8', timeout: 30_000, windowsHide: true, env: { ...base, ...extra } });
  const pull = (config, extra = {}) => {
    const fetched = git(config, ['fetch', '--quiet', 'origin', 'main'], extra);
    return fetched.status === 0 ? git([], ['merge', '--ff-only', '--quiet', 'origin/main']) : fetched;
  };
  let last;
  for (const identity of hostGithubTokens({ env, run })) {
    last = pull(['-c', 'credential.helper=', '-c', `credential.helper=${ENV_GIT_HELPER}`], { KOMBIFY_GIT_TOKEN: identity.token });
    if (last.status === 0) return { ok: true, source: identity.source };
    if (!authFailure(last)) break;
  }
  last ??= pull([]);
  return { ok: last.status === 0, source: 'git-default', reason: String(last.stderr ?? '').trim().split('\n')[0] };
}

// gh with the first host identity GitHub accepts; a revoked gh login is skipped.
function ghWithHostIdentity(args, { run, env }) {
  let last;
  for (const identity of hostGithubTokens({ env, run })) {
    last = run('gh', args, { encoding: 'utf8', timeout: 20_000, env: { ...env, GH_TOKEN: identity.token, GH_PROMPT_DISABLED: '1' } });
    if (last.status === 0 || !authFailure(last)) return last;
  }
  return last ?? run('gh', args, { encoding: 'utf8', timeout: 20_000 });
}

// The owner's cross-project rules (AGENTS.md "Owner Rules") for every session
// on every host. Keeps this device's Agent Home checkout current (fast-forward
// only, on a clean main); a checkout off main or with edits is reported, never
// moved, and the rules then come from GitHub, else from the last cached copy.
export function ownerRules({ home = homedir(), run = spawnSync, env = process.env } = {}) {
  const notes = [];
  // A cloud session's checkout was refreshed at session start by kombify-up's
  // agent-home step, through the attached source or the broker bundle; a
  // fast-forward here would only meet the proxy's refusal of an unattached one.
  const cloud = env.CLAUDE_CODE_REMOTE === 'true';
  let root = '';
  try { root = JSON.parse(readFileSync(join(home, '.agents', 'agent-home', 'state.json'), 'utf8')).repo_root ?? ''; } catch { /* no local install */ }
  if (!root && cloud && existsSync(join(home, '.agent-home', '.git'))) root = join(home, '.agent-home');
  if (root && existsSync(join(root, '.git'))) {
    const git = (...args) => run('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 20_000 });
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout?.trim();
    const dirty = git('status', '--porcelain', '--untracked-files=no').stdout?.trim();
    if (branch === 'main' && !dirty) {
      const pull = cloud ? { ok: true } : fastForwardAgentHome(root, { run, env });
      if (!pull.ok) notes.push(`agent-home ${root}: fast-forward failed (${pull.reason})`);
      const local = join(root, OWNER_RULES_PATH);
      if (existsSync(local)) return { text: readFileSync(local, 'utf8'), source: `${root}@${git('rev-parse', '--short', 'HEAD').stdout?.trim()}`, notes };
    } else {
      notes.push(`agent-home ${root} is ${branch === 'main' ? 'modified' : `on ${branch}`}: save that work to its own branch and return the checkout to main`);
    }
  }
  const fetched = ghWithHostIdentity(['api', `repos/${AGENT_HOME_REPO}/contents/${OWNER_RULES_PATH}`, '-H', 'Accept: application/vnd.github.raw'], { run, env });
  if (fetched.status === 0 && String(fetched.stdout).startsWith('# Owner rules')) {
    mkdirSync(dirname(OWNER_RULES_CACHE), { recursive: true, mode: 0o700 });
    writeFileSync(OWNER_RULES_CACHE, fetched.stdout, { mode: 0o600 });
    return { text: fetched.stdout, source: `github:${AGENT_HOME_REPO}`, notes };
  }
  if (existsSync(OWNER_RULES_CACHE)) return { text: readFileSync(OWNER_RULES_CACHE, 'utf8'), source: `cache:${OWNER_RULES_CACHE}`, notes };
  notes.push(`owner rules unreachable: gh cannot read ${AGENT_HOME_REPO}; follow AGENTS.md and say once that they were not read`);
  return { text: '', source: 'none', notes };
}

function printOwnerRules() {
  const rules = ownerRules();
  for (const note of rules.notes) console.log(`KOMBIFY_OWNER_RULES_GAP ${note}`);
  if (rules.text) console.log(`\nKOMBIFY_OWNER_RULES source=${rules.source} (binding for this session):\n\n${rules.text.trim()}\n`);
}

// GitHub identities the broker workflow accepts (cloud-session-doppler.yml):
// marcel490 is the Claude cloud proxy, Soulcreek is gh on the owner's devices.
export const BROKER_ACTORS = ['marcel490', 'Soulcreek'];

// The active gh account, read locally: a throttled or unreachable GitHub API must
// not turn a signed-in owner identity into a login prompt. The broker workflow
// verifies the actor itself and reports a spent REST budget as throttling.
function ghLogin() {
  const token = spawnSync('gh', ['auth', 'token', '--hostname', 'github.com'], { encoding: 'utf8' });
  if (token.status !== 0 || !token.stdout.trim()) return '';
  const user = spawnSync('gh', ['config', 'get', '-h', 'github.com', 'user'], { encoding: 'utf8' });
  if (user.status === 0 && user.stdout.trim()) return user.stdout.trim();
  const result = spawnSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

// Finds this host's Doppler access along its routes (header and
// lib/doppler-routes.mjs). `validate` proves each token at GET /me first, so a
// dead CLI login or device token falls through to the next route. The cloud
// network route has no token value (`token: ''`, the proxy authenticates);
// only callers that pass `requireToken: false` take it, the others (the Doppler
// CLI, kombify-up) need a value and go on to the broker. `dispatch: false` (the
// hook) never starts a broker run; the first command that needs secrets does.
// The broker serves every host whose gh acts as an owner identity, so a fresh
// device needs only its GitHub sign-in, never a Doppler login.
export async function resolveDoppler({ env = process.env, root = ROOT, dispatch = true, interactive = false, readOnly = false, validate = false, requireToken = true, cli = cliToken, broker = loadBroker, gh = ghLogin, device = readDeviceToken, probe = probeToken } = {}) {
  const off = disabledRoutes(env);
  const notes = [];
  const usable = async (route, value) => {
    if (!validate) return true;
    const status = await probe(value);
    if (status === 200) return true;
    notes.push(`${route} rejected (${typeof status === 'number' ? `HTTP ${status}` : status})`);
    return false;
  };
  const explicit = env.DOPPLER_TOKEN;
  const remote = env.CLAUDE_CODE_REMOTE === 'true';
  // In a Claude cloud session DOPPLER_TOKEN is the placeholder of the
  // environment's api.doppler.com credential, which the proxy swaps for the
  // value: the network route, proven like any token so a dead one falls through.
  if (explicit && remote && !off.has('network') && await usable('network', explicit)) return { source: 'network', token: explicit };
  if (explicit && !remote && !off.has('env') && await usable('env', explicit)) return { source: 'env', token: explicit };
  const fromCli = off.has('cli') || remote ? { disabled: true } : cli(root);
  const cliValue = fromCli.token;
  if (cliValue && await usable('cli', cliValue)) return { source: 'cli', token: cliValue };
  if (env.GITHUB_ACTIONS === 'true') {
    return { source: 'github-actions', skipped: 'GitHub Actions uses OIDC or its repository secrets, not a session route (SECRETS-ACCESS-STANDARD.md §4); pass DOPPLER_TOKEN explicitly for an operator-only job' };
  }
  if (!remote && !off.has('device')) {
    const stored = device();
    const deviceValue = stored.token;
    if (deviceValue && await usable('device', deviceValue)) return { source: 'device', token: deviceValue };
    if (!deviceValue) notes.push(`no device token in ${stored.store}`);
  }
  const source = remote ? 'cloud-broker' : 'github-broker';
  let mod = null;
  let staleGrant = false;
  if (!off.has('broker') && (remote || BROKER_ACTORS.includes(gh()))) {
    try {
      mod = await broker({ readOnly });
      const cached = mod.readCache?.();
      const cachedValue = cached?.token;
      if (cachedValue && await usable('broker', cachedValue)) return { source, token: cachedValue };
      staleGrant = Boolean(cachedValue);
    } catch (error) {
      notes.push(`GitHub broker unavailable: ${error.message}`);
      mod = null;
    }
  } else if (!off.has('broker') && !remote) notes.push('gh is not an owner identity for the broker');
  if (remote && !explicit && !off.has('network') && !requireToken) {
    const status = await probe('');
    if (status === 200) return { source: 'network', token: '' };
    notes.push(`no api.doppler.com credential in this environment (HTTP ${status})`);
  }
  if (mod) {
    if (readOnly || !dispatch) return { source, pending: true };
    try {
      const record = await mod.login(staleGrant ? { force: true } : undefined);
      const grantValue = record.token;
      return { source, token: grantValue };
    } catch (error) {
      notes.push(`GitHub broker failed: ${error.message}`);
    }
  }
  if (!readOnly && interactive && !fromCli.missing && !off.has('cli')) {
    spawnSync('doppler', ['login', '--scope', root], { stdio: 'inherit' });
    const after = cli(root);
    if (after.token) return { source: 'cli', token: after.token };
  }
  const repair = remote
    ? 'attach the environment\'s api.doppler.com credential or let the broker run (cloud-session-doppler.yml)'
    : '`node scripts/kombify-bootstrap.mjs doppler-routes --repair` on a host with a Doppler route, or `gh auth login` as an owner identity';
  return { gap: `no Doppler route ready${notes.length ? ` (${notes.join('; ')})` : ''}: ${repair}` };
}

// Every route of this host with its state, for `doppler-routes`, the session
// check and the daily credential health. `live` proves the broker with a fresh
// grant (one workflow run); without it a valid cached grant or an owner gh
// identity (on demand) counts. `repair` mints or renews the device token.
export async function checkRoutes({ env = process.env, root = ROOT, live = false, repair = false, cli = cliToken, broker = loadBroker, gh = ghLogin, probe = probeToken, deviceState = deviceTokenState, renew = renewDeviceToken } = {}) {
  const host = hostType(env);
  const required = REQUIRED_ROUTES[host] ?? [];
  const off = disabledRoutes(env);
  const routes = [];
  const item = (route, status, detail) => routes.push({ route, role: required.includes(route) ? 'required' : 'accelerator', status: off.has(route) ? 'disabled' : status, detail });
  const http = (status) => (typeof status === 'number' ? `HTTP ${status}` : status);
  if (host === 'ci') return { host, required, routes, ready: true };
  if (host === 'device') {
    const fromCli = cli(root);
    const cliValue = fromCli.token;
    const cliStatus = cliValue ? await probe(cliValue) : null;
    item('cli', cliStatus === 200 ? 'ready' : cliValue ? 'rejected' : 'missing', cliStatus === 200 ? 'signed-in Doppler CLI' : cliValue ? `CLI login rejected (${http(cliStatus)}); doppler login renews it` : fromCli.missing ? 'Doppler CLI not installed' : 'Doppler CLI not signed in');
    let state = await deviceState();
    if (repair && state.status !== 'ready') {
      // The expiring token mints its own successor; a missing or dead one needs the CLI login.
      const mintWith = state.status === 'expiring' ? state.token : cliStatus === 200 ? cliValue : env.DOPPLER_TOKEN;
      try {
        const renewed = await renew({ mintWith });
        state = { status: 'repaired', detail: `${renewed.name} stored in ${renewed.store}, expires ${renewed.expiresAt}${renewed.revoked.length ? `; ${renewed.revoked.join(', ')}` : ''}` };
      } catch (error) {
        state = { ...state, detail: `${state.status}${state.name ? ` ${state.name}` : ''}; renewal failed: ${error.message}` };
      }
    }
    const days = Number.isInteger(state.daysLeft) ? `, ${state.daysLeft} days left` : '';
    item('device', state.status, state.detail && state.status !== 'rejected' ? state.detail : state.status === 'missing'
      ? `no device token in ${state.store}; repair: node scripts/kombify-bootstrap.mjs doppler-routes --repair`
      : `${state.name} in ${state.store}${days}${state.status === 'rejected' ? ` rejected (${state.detail})` : ''}`);
  }
  if (host === 'cloud') {
    const placeholder = env.DOPPLER_TOKEN ?? '';
    const status = await probe(placeholder);
    item('network', status === 200 ? 'ready' : placeholder ? 'rejected' : 'missing', status === 200
      ? 'the environment\'s api.doppler.com credential (DOPPLER_TOKEN placeholder, swapped by the proxy)'
      : placeholder ? `the environment's api.doppler.com credential is rejected (${http(status)}); renew it in the environment dialog` : 'the environment has no api.doppler.com credential (no DOPPLER_TOKEN placeholder)');
  }
  if (!(host === 'cloud' || BROKER_ACTORS.includes(gh()))) {
    item('broker', 'missing', `gh is not one of the broker identities ${BROKER_ACTORS.join(', ')}`);
  } else {
    try {
      const mod = await broker({});
      const cached = live ? null : mod.readCache?.();
      if (cached) {
        item('broker', await probe(cached.token) === 200 ? 'ready' : 'rejected', `cached grant until ${cached.expires_at ?? 'unknown'}`);
      } else if (!live) {
        item('broker', 'on-demand', 'owner gh identity present; the first command that needs secrets dispatches the grant');
      } else {
        const record = await mod.login({ force: true });
        const status = await probe(record.token);
        item('broker', status === 200 ? 'ready' : 'rejected', `fresh grant ${record.run ?? ''} (${http(status)})`.replace(' ()', ''));
      }
    } catch (error) {
      item('broker', 'failed', error.message);
    }
  }
  const usable = new Set(['ready', 'repaired', 'expiring', 'on-demand']);
  const ready = required.every((route) => routes.some((r) => r.route === route && usable.has(r.status)));
  return { host, required, routes, ready };
}

async function doppler(path, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${DOPPLER_API}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  let body = null;
  try { body = await response.json(); } catch { /* status decides */ }
  return { status: response.status, body };
}

export async function verifyScope(token, scope, fetchImpl = fetch) {
  const q = new URLSearchParams({ project: scope.project, config: scope.config });
  const { status } = await doppler(`/configs/config?${q}`, token, fetchImpl);
  return status === 200 ? null : `Doppler answered HTTP ${status} for ${scope.project}/${scope.config}; this identity lacks access to the repository scope`;
}

async function secretsOf(token, scope) {
  const q = new URLSearchParams({ project: scope.project, config: scope.config, format: 'json' });
  const { status, body } = await doppler(`/configs/config/secrets/download?${q}`, token);
  if (status !== 200 || !body) throw new Error(`Doppler answered HTTP ${status} for ${scope.project}/${scope.config}`);
  return body;
}

// One secret through this host's routes, for a script that needs a single value
// outside `run` (pg-egress.mjs). The value is returned, never printed.
export async function dopplerSecret({ project, config, name }, { env = process.env, interactive = false, resolve = resolveDoppler } = {}) {
  const access = await resolve({ env, validate: true, requireToken: false, interactive });
  if (typeof access.token !== 'string') throw new Error(access.gap ?? access.skipped ?? (access.pending ? 'Doppler broker grant pending' : 'no Doppler route'));
  const q = new URLSearchParams({ project, config, name });
  const { status, body } = await doppler(`/configs/config/secret?${q}`, access.token);
  const value = body?.value?.computed ?? body?.value?.raw;
  if (status !== 200 || !value) throw new Error(`Doppler answered HTTP ${status} for ${project}/${config} ${name} through route ${access.source}`);
  return { value, source: access.source };
}

async function packagesToken(env, access) {
  if (env.NODE_AUTH_TOKEN) return { source: 'env', token: env.NODE_AUTH_TOKEN };
  if (env.CLAUDE_CODE_REMOTE === 'true') {
    const record = await (await loadBroker()).login({ grant: 'github-packages-read' });
    return { source: 'cloud-broker', token: record.token };
  }
  if (!access.token) throw new Error(access.gap ?? access.skipped ?? 'no Doppler access for the package token');
  const q = new URLSearchParams(PACKAGES_SECRET);
  const { status, body } = await doppler(`/configs/config/secret?${q}`, access.token);
  const token = body?.value?.computed;
  if (status !== 200 || !token) throw new Error(`Doppler answered HTTP ${status} for ${PACKAGES_SECRET.project}/${PACKAGES_SECRET.config} ${PACKAGES_SECRET.name}`);
  return { source: `doppler:${PACKAGES_SECRET.project}/${PACKAGES_SECRET.config}`, token };
}

// Private modules this repository's go.mod requires (none outside a Go repository).
export function privateGoModules(goMod) {
  // Comments and the repository's own module line name nothing to fetch.
  const requires = goMod.split('\n').map(line => line.replace(/\/\/.*$/, '')).filter(line => !/^\s*module\s/.test(line)).join('\n');
  return [...new Set([...requires.matchAll(/github\.com\/KombiverseLabs\/([A-Za-z0-9_.-]+)/g)].map(match => match[1]))].sort();
}

// A cloud session reaches a private module only when its repository is
// attached to the session; probe each instead of reporting Go ready.
function unreachableGoModules(env, cwd = process.cwd()) {
  if (env.CLAUDE_CODE_REMOTE !== 'true' || !existsSync(join(cwd, 'go.mod'))) return [];
  return privateGoModules(readFileSync(join(cwd, 'go.mod'), 'utf8')).filter(repo => spawnSync('git',
    ['ls-remote', '--exit-code', `https://github.com/KombiverseLabs/${repo}`, 'HEAD'],
    { encoding: 'utf8', timeout: 30000, env: { ...env, GIT_TERMINAL_PROMPT: '0' } }).status !== 0);
}

function configureGo({ required = false, env = process.env, check = false } = {}) {
  const go = spawnSync('go', check ? ['env', 'GOPRIVATE', 'GONOSUMDB'] : ['env', '-w', `GOPRIVATE=${PRIVATE_GO}`, `GONOSUMDB=${PRIVATE_GO}`], { encoding: 'utf8', env });
  const drift = check && !go.error && go.status === 0 && go.stdout.trim().split(/\r?\n/).some(value => value !== PRIVATE_GO);
  const missing = go.error || go.status !== 0 ? [] : unreachableGoModules(env);
  const status = go.error ? 'pending' : go.status !== 0 ? 'failed' : missing.length || drift ? 'pending' : 'ready';
  console.log(`KOMBIFY_BOOTSTRAP_CAPABILITY ${JSON.stringify({ name: 'go', required, status, errorCode: go.error?.code ?? (missing.length ? 'private_module_not_attached' : undefined), ...(missing.length ? { attach: missing.map(repo => `KombiverseLabs/${repo}`) } : {}) })}`);
  if (go.error) return required ? `Go is required by the selected task (${go.error.code ?? 'unavailable'})` : null;
  if (go.status !== 0) return required ? `go env${check ? '' : ' -w'} failed for the selected Go task` : null;
  if (drift) return 'Go private module configuration needs repair: node scripts/kombify-bootstrap.mjs';
  return missing.length && required ? `private Go modules are not attached to this cloud session: add_repo ${missing.map(repo => `KombiverseLabs/${repo}`).join(', ')}` : null;
}

function configureNpm(env, { check = false } = {}) {
  const path = env.NPM_CONFIG_USERCONFIG || join(homedir(), '.npmrc');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const next = mergeNpmrc(current);
  if (next !== current) {
    if (check) return 'npm scope configuration needs repair: node scripts/kombify-bootstrap.mjs';
    writeFileSync(path, next, { mode: 0o600 });
  }
}

function runWith(cmd, extraEnv) {
  if (!cmd.length) throw new Error('usage: kombify-bootstrap.mjs run|packages -- <command...>');
  const env = { ...process.env, ...extraEnv };
  // The proxy switch was only for this script's own fetch; the command keeps the caller's setting.
  if (env.KOMBIFY_BOOTSTRAP_PROXY) delete env.NODE_USE_ENV_PROXY;
  delete env.KOMBIFY_BOOTSTRAP_PROXY;
  const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', cwd: process.cwd(), env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function vendoredPackages(root = ROOT) {
  try { return readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').includes('# kombify-vendor:start'); } catch { return false; }
}

function installCommand() {
  const viaMise = existsSync(join(ROOT, 'mise.toml')) && spawnSync('mise', ['--version']).status === 0;
  return viaMise ? ['mise', 'exec', '--', 'pnpm', 'install', '--frozen-lockfile'] : ['pnpm', 'install', '--frozen-lockfile'];
}

export async function main(argv, env = process.env) {
  if (env.KOMBIFY_BOOTSTRAP_SKIP === '1') return 0;
  const sep = argv.indexOf('--');
  const [command] = argv;
  const cmd = sep >= 0 ? argv.slice(sep + 1) : [];
  const own = sep >= 0 ? argv.slice(0, sep) : argv;
  const check = own.includes('--check');
  if (check && (own.includes('--install') || own.includes('--hook') || ['run', 'packages', 'rules'].includes(command))) throw new Error('--check cannot be combined with an installing or executing command');
  const scope = resolveScope({ argv: own });
  const option = (flag) => { const index = own.indexOf(flag); return index >= 0 ? own[index + 1] : undefined; };
  // A Claude cloud session reaches Soulcreek/agent-home through git only as an
  // attached source; when the proxy refuses the clone or fetch, the broker
  // workflow hands it a sealed bundle of main instead (grant agent-home). A
  // checkout refreshed from a bundle within the hour (resume, compaction) is
  // used as it is, and the kombify-up CI canary never takes this route.
  const personalContext = async (install) => {
    const options = { home: option('--home'), checkout: option('--agent-home'), agents: option('--agents'), device: option('--device'), install };
    const context = prepareAgentHome(options);
    if (!install || env.CLAUDE_CODE_REMOTE !== 'true' || env.KOMBIFY_UP_CANARY === '1' || !['agent_home_source_access_failed', 'agent_home_source_refresh_failed'].includes(context.code)) return context;
    const fetched = context.source ? join(context.source, '.git', 'FETCH_HEAD') : '';
    if (context.code === 'agent_home_source_refresh_failed' && fetched && existsSync(fetched) && Date.now() - statSync(fetched).mtimeMs < 60 * 60_000) {
      return { ...prepareAgentHome({ ...options, refresh: false }), route: 'github-broker', run: 'refreshed within the hour' };
    }
    let bundle;
    try { bundle = await (await loadBroker()).agentHomeBundle(); } catch (error) {
      return { ...context, reason: `git proxy refused the unattached source; broker route failed: ${String(error.message).replace(/\s+/g, ' ').slice(0, 400)}` };
    }
    try { return { ...prepareAgentHome({ ...options, bundle }), route: 'github-broker', run: bundle.run }; } finally { rmSync(bundle.path, { force: true }); }
  };

  const staffMcp = install => prepareStaffMcp({ root: ROOT, host: option('--mcp-host'), surface: option('--mcp-surface') ?? 'staff', checkout: option('--plugins-source'), credentialSource: own.includes('--mcp-credential-source') ? option('--mcp-credential-source') ?? '' : undefined, githubSession: () => loadBroker({ qualified: true, readOnly: check }), install: install && !own.includes('--hook'), inspectOnly: check, env });
  if (command === 'mcp') {
    const capability = await staffMcp(own.includes('--install'));
    console.log(`KOMBIFY_BOOTSTRAP_CAPABILITY ${JSON.stringify({ name: 'staff-mcp', ...capability })}`);
    return ['ready', 'not-required'].includes(capability.status) ? 0 : 1;
  }
  if (command === 'context') {
    const context = await personalContext(!own.includes('--check'));
    console.log(`KOMBIFY_BOOTSTRAP_CAPABILITY ${JSON.stringify({ name: 'personal-context', ...context })}`);
    return context.status === 'ready' ? 0 : 1;
  }
  if (command === 'run') {
    if (!scope) throw new Error('no Doppler scope: add .kombify/secrets.json (secrets-bootstrap-marker.mjs) or pass --project and --config');
    const access = await resolveDoppler({ env, interactive: process.stdin.isTTY, validate: true, requireToken: false });
    if (typeof access.token !== 'string') throw new Error(access.gap ?? access.skipped ?? 'Doppler broker grant pending');
    const secrets = await secretsOf(access.token, scope);
    // The network route has no value to pass on: the command gets the secrets, not DOPPLER_TOKEN.
    const passOn = access.token ? { DOPPLER_TOKEN: access.token } : {};
    return runWith(cmd, { ...secrets, ...passOn, DOPPLER_PROJECT: scope.project, DOPPLER_CONFIG: scope.config, KOMBIFY_DOPPLER_ROUTE: access.source });
  }
  if (command === 'doppler-routes') {
    const result = await checkRoutes({ env, live: own.includes('--live'), repair: own.includes('--repair') });
    if (own.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else for (const route of result.routes) console.log(`KOMBIFY_DOPPLER_ROUTE ${JSON.stringify(route)}`);
    const names = (statuses) => result.routes.filter((r) => statuses.includes(r.status)).map((r) => r.route).join(',') || 'none';
    console.log(result.ready
      ? `KOMBIFY_DOPPLER_ROUTES_OK host=${result.host} required=${result.required.join(',') || 'none'} ready=${names(['ready', 'repaired', 'expiring', 'on-demand'])}`
      : `KOMBIFY_DOPPLER_ROUTES_GAP host=${result.host} required=${result.required.join(',')} not-ready=${result.routes.filter((r) => r.role === 'required' && !['ready', 'repaired', 'expiring', 'on-demand'].includes(r.status)).map((r) => r.route).join(',')}`);
    return result.ready ? 0 : 1;
  }
  if (command === 'rules') {
    printOwnerRules();
    return 0;
  }
  if (command === 'packages') {
    configureNpm(env);
    const access = env.NODE_AUTH_TOKEN || env.CLAUDE_CODE_REMOTE === 'true' ? {} : await resolveDoppler({ env, interactive: process.stdin.isTTY, validate: true });
    const pkg = await packagesToken(env, access);
    return runWith(cmd, { NODE_AUTH_TOKEN: pkg.token });
  }

  const hook = own.includes('--hook');
  const gaps = [];
  const goGap = configureGo({ required: own.includes('--require-go'), env, check });
  if (goGap) gaps.push(`go: ${goGap}`);
  const npmGap = configureNpm(env, { check });
  if (npmGap) gaps.push(`npm: ${npmGap}`);
  const access = await resolveDoppler({ env, dispatch: !hook && !check, interactive: !hook && !check && process.stdin.isTTY, readOnly: check, validate: true, requireToken: false }).catch((error) => ({ gap: error.message }));
  if (access.gap) gaps.push(`doppler: ${access.gap}`);
  if (typeof access.token === 'string' && scope) {
    const gap = await verifyScope(access.token, scope).catch((error) => `Doppler not reachable (${error.cause?.code ?? error.message})`);
    if (gap) gaps.push(`doppler: ${gap}`);
  }
  if (own.includes('--install') && existsSync(join(ROOT, 'package.json'))) {
    // Vendored private packages (§6d) install with no token and no Doppler access.
    if (vendoredPackages()) {
      console.log(`KOMBIFY_BOOTSTRAP_INSTALL ${ROOT} packages=vendored`);
      const status = runWith(installCommand(), {});
      if (status !== 0) gaps.push(`install: exited ${status}`);
    } else if (!gaps.length) {
      console.log(`KOMBIFY_BOOTSTRAP_INSTALL ${ROOT}`);
      const status = await main(['packages', '--', ...installCommand()], env);
      if (status !== 0) gaps.push(`install: exited ${status}`);
    }
  }
  const context = env.GITHUB_ACTIONS === 'true' ? { status: 'not-required', source: 'github-actions' } : await personalContext(own.includes('--install'));
  console.log(`KOMBIFY_BOOTSTRAP_CAPABILITY ${JSON.stringify({ name: 'personal-context', ...context })}`);
  if (context.status === 'failed') gaps.push(`personal-context: ${context.code}`);
  const mcp = own.includes('--install') ? await staffMcp(true) : { status: 'not-requested' };
  if (own.includes('--install')) console.log(`KOMBIFY_BOOTSTRAP_CAPABILITY ${JSON.stringify({ name: 'staff-mcp', ...mcp })}`);
  const pending = context.status === 'pending' || access.pending || mcp.status === 'pending';
  const scopeText = scope ? `${scope.project}/${scope.config}` : 'none';
  const dopplerText = access.source ? `${access.source}${access.pending ? '(on-demand)' : ''}${access.skipped ? '(repository-secrets)' : ''}` : 'missing';
  for (const gap of gaps) console.log(`KOMBIFY_BOOTSTRAP_GAP ${gap}`);
  if (!gaps.length) console.log(`KOMBIFY_BOOTSTRAP_${pending ? 'PENDING' : 'OK'} doppler=${dopplerText} scope=${scopeText} goprivate=${PRIVATE_GO}`);
  if (hook) {
    const rel = 'scripts/kombify-bootstrap.mjs';
    console.log(`Install: node ${rel} --install. Secrets for a command: node ${rel} run -- <cmd>. Package token for a command: node ${rel} packages -- <cmd>. Tokens are fetched on demand; never report a missing NODE_AUTH_TOKEN or DOPPLER_TOKEN as a blocker.`);
    // In a cloud session of the workspace, kombify-up prints them right after
    // its agent-home step installs Agent Home; SessionStart hooks run side by
    // side, so this hook would race that install.
    if (!(env.CLAUDE_CODE_REMOTE === 'true' && existsSync(join(ROOT, 'scripts', 'kombify-up.mjs')))) printOwnerRules();
  }
  return (gaps.length || pending) && !hook ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Node's fetch honours HTTPS_PROXY only with NODE_USE_ENV_PROXY (cloud sessions).
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    const child = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', KOMBIFY_BOOTSTRAP_PROXY: '1' } });
    process.exit(child.status ?? 1);
  }
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => { console.error(`KOMBIFY_BOOTSTRAP_ERROR ${error.message}`); process.exit(process.argv.includes('--hook') ? 0 : 1); },
  );
}
