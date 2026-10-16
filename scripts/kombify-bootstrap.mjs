#!/usr/bin/env node
// The one development bootstrap of every Kombify repository
// (SECRETS-ACCESS-STANDARD.md §6c, DEVCONTAINER-STANDARD.md §5). Canonical in
// kombify-workspace; repo-context-sync.mjs projects it unchanged into each
// repository as scripts/kombify-bootstrap.mjs. It sets up, in any environment,
// what a session needs to install, build, test and run the repository:
//
// - Go: private github.com/KombiverseLabs/* modules (GOPRIVATE, GONOSUMDB).
// - npm: the @kombiverselabs/@kombify scopes in the user npmrc, reading
//   ${NODE_AUTH_TOKEN} (pnpm >= 11.5.3 ignores a project .npmrc token).
// - Doppler: access to the repository's own scope from .kombify/secrets.json
//   or doppler.yaml, resolved in this order:
//     1. DOPPLER_TOKEN already set (dev container from the host, broker);
//     2. the Doppler CLI signed in on this host (workstation, dev container);
//     3. GitHub Actions: none; CI uses its repository secrets (§4);
//     4. any host whose gh acts as an owner identity (Claude cloud session,
//        a fresh device, Codex, Cursor): the GitHub-OIDC broker of
//        kombify-workspace (cloud-doppler-session.mjs, §6b), fetched with `gh`;
//     5. an interactive terminal with the Doppler CLI: `doppler login`.
// - Package token: NODE_AUTH_TOKEN when set; in a cloud session the broker's
//   read-only packages grant; elsewhere Doppler kombify-io/prd_gateway
//   GITHUB_PACKAGES_READ_TOKEN through the access above. It reaches only the
//   install command and is never written to disk.
//
//   node scripts/kombify-bootstrap.mjs            # set up + verify, exit 1 on a gap
//   node scripts/kombify-bootstrap.mjs --hook     # same, never fails, no broker dispatch
//   node scripts/kombify-bootstrap.mjs --install  # also pnpm install --frozen-lockfile
//                                                 # (no token at all where packages are vendored, §6d)
//   node scripts/kombify-bootstrap.mjs run -- <cmd...>   # cmd with the repo's Doppler secrets
//   node scripts/kombify-bootstrap.mjs packages -- <cmd...>  # cmd with NODE_AUTH_TOKEN
//   node scripts/kombify-bootstrap.mjs rules     # the owner's rules (also printed by --hook)
//   node scripts/kombify-bootstrap.mjs mcp --mcp-host codex --install # repair + prove selected native staff MCP
//   node scripts/kombify-bootstrap.mjs context   # obtain/refresh and install Agent Home
//   node scripts/kombify-bootstrap.mjs context --check  # inspect without installation
//
// - Owner rules: `standards/rules.md` of Soulcreek/agent-home, from this
//   device's Agent Home checkout (fast-forwarded on a clean main), else from
//   GitHub through gh, else from the last cached copy.
//   flags: --project P --config C override the repository scope.
//
// Prints names, sources and statuses only, never a secret value.
// KOMBIFY_BOOTSTRAP_SKIP=1 disables it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareAgentHome } from './lib/agent-home-bootstrap.mjs';
import { prepareStaffMcp } from './lib/staff-mcp-bootstrap.mjs';

const SELF = fileURLToPath(import.meta.url);
export const ROOT = resolve(dirname(SELF), '..');
export const DOPPLER_API = 'https://api.doppler.com/v3';
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

export async function loadBroker({ qualified = false } = {}) {
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

// The owner's cross-project rules (AGENTS.md "Owner Rules") for every session
// on every host. Keeps this device's Agent Home checkout current (fast-forward
// only, on a clean main); a checkout off main or with edits is reported, never
// moved, and the rules then come from GitHub, else from the last cached copy.
export function ownerRules({ home = homedir(), run = spawnSync } = {}) {
  const notes = [];
  let root = '';
  try { root = JSON.parse(readFileSync(join(home, '.agents', 'agent-home', 'state.json'), 'utf8')).repo_root ?? ''; } catch { /* no local install */ }
  if (root && existsSync(join(root, '.git'))) {
    const git = (...args) => run('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 20_000 });
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout?.trim();
    const dirty = git('status', '--porcelain', '--untracked-files=no').stdout?.trim();
    if (branch === 'main' && !dirty) {
      const pull = git('pull', '--ff-only', '--quiet');
      if (pull.status !== 0) notes.push(`agent-home ${root}: fast-forward failed (${String(pull.stderr ?? '').trim().split('\n')[0]})`);
      const local = join(root, OWNER_RULES_PATH);
      if (existsSync(local)) return { text: readFileSync(local, 'utf8'), source: `${root}@${git('rev-parse', '--short', 'HEAD').stdout?.trim()}`, notes };
    } else {
      notes.push(`agent-home ${root} is ${branch === 'main' ? 'modified' : `on ${branch}`}: save that work to its own branch and return the checkout to main`);
    }
  }
  const fetched = run('gh', ['api', `repos/${AGENT_HOME_REPO}/contents/${OWNER_RULES_PATH}`, '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8', timeout: 20_000 });
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

// Finds the Doppler token for this environment. `dispatch: false` (the hook)
// never starts a broker run; the first command that needs secrets does.
// The GitHub-OIDC broker serves every host whose gh acts as an owner identity,
// so a fresh device needs only its GitHub sign-in, never a Doppler login.
export async function resolveDoppler({ env = process.env, root = ROOT, dispatch = true, interactive = false, cli = cliToken, broker = loadBroker, gh = ghLogin } = {}) {
  if (env.DOPPLER_TOKEN) return { source: 'env', token: env.DOPPLER_TOKEN };
  const fromCli = cli(root);
  if (fromCli.token) return { source: 'cli', token: fromCli.token };
  if (env.GITHUB_ACTIONS === 'true') {
    return { source: 'github-actions', skipped: 'GitHub Actions uses its repository secrets, not Doppler (SECRETS-ACCESS-STANDARD.md §4); pass DOPPLER_TOKEN explicitly for an operator-only job' };
  }
  const remote = env.CLAUDE_CODE_REMOTE === 'true';
  let brokerError = '';
  if (remote || BROKER_ACTORS.includes(gh())) {
    const source = remote ? 'cloud-broker' : 'github-broker';
    try {
      const mod = await broker();
      const cached = mod.readCache?.();
      if (cached) return { source, token: cached.token };
      if (!dispatch) return { source, pending: true };
      const record = await mod.login();
      return { source, token: record.token };
    } catch (error) {
      if (remote) throw error;
      brokerError = `; GitHub broker failed: ${error.message}`;
    }
  }
  if (interactive && !fromCli.missing) {
    spawnSync('doppler', ['login', '--scope', root], { stdio: 'inherit' });
    const after = cli(root);
    if (after.token) return { source: 'cli', token: after.token };
  }
  return {
    gap: (fromCli.missing
      ? 'Doppler CLI not installed and no owner GitHub identity in gh: `gh auth login` as an owner identity, or install the Doppler CLI and `doppler login`'
      : 'Doppler CLI not signed in and no owner GitHub identity in gh: `gh auth login` as an owner identity, or `doppler login`') + brokerError,
  };
}

async function doppler(path, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${DOPPLER_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
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

function configureGo({ required = false } = {}) {
  const go = spawnSync('go', ['env', '-w', `GOPRIVATE=${PRIVATE_GO}`, `GONOSUMDB=${PRIVATE_GO}`], { encoding: 'utf8' });
  console.log(`KOMBIFY_BOOTSTRAP_CAPABILITY ${JSON.stringify({ name: 'go', required, status: go.error ? 'pending' : go.status === 0 ? 'ready' : 'failed', errorCode: go.error?.code })}`);
  if (go.error) return required ? `Go is required by the selected task (${go.error.code ?? 'unavailable'})` : null;
  return go.status === 0 || !required ? null : 'go env -w failed for the selected Go task';
}

function configureNpm(env) {
  const path = env.NPM_CONFIG_USERCONFIG || join(homedir(), '.npmrc');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const next = mergeNpmrc(current);
  if (next !== current) writeFileSync(path, next, { mode: 0o600 });
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
  const scope = resolveScope({ argv: own });
  const option = (flag) => { const index = own.indexOf(flag); return index >= 0 ? own[index + 1] : undefined; };
  const personalContext = (install) => prepareAgentHome({
    home: option('--home'), checkout: option('--agent-home'), agents: option('--agents'), device: option('--device'), install,
  });

  const staffMcp = install => prepareStaffMcp({ root: ROOT, host: option('--mcp-host'), checkout: option('--plugins-source'), credentialSource: own.includes('--mcp-credential-source') ? option('--mcp-credential-source') ?? '' : undefined, githubSession: () => loadBroker({ qualified: true }), install: install && !own.includes('--hook'), env });
  if (command === 'mcp') {
    const capability = await staffMcp(own.includes('--install'));
    console.log(`KOMBIFY_BOOTSTRAP_CAPABILITY ${JSON.stringify({ name: 'staff-mcp', ...capability })}`);
    return ['ready', 'not-required'].includes(capability.status) ? 0 : 1;
  }
  if (command === 'context') {
    const context = personalContext(!own.includes('--check'));
    console.log(`KOMBIFY_BOOTSTRAP_CAPABILITY ${JSON.stringify({ name: 'personal-context', ...context })}`);
    return context.status === 'ready' ? 0 : 1;
  }
  if (command === 'run') {
    if (!scope) throw new Error('no Doppler scope: add .kombify/secrets.json (secrets-bootstrap-marker.mjs) or pass --project and --config');
    const access = await resolveDoppler({ env, interactive: process.stdin.isTTY });
    if (!access.token) throw new Error(access.gap ?? access.skipped);
    const secrets = await secretsOf(access.token, scope);
    return runWith(cmd, { ...secrets, DOPPLER_TOKEN: access.token, DOPPLER_PROJECT: scope.project, DOPPLER_CONFIG: scope.config });
  }
  if (command === 'rules') {
    printOwnerRules();
    return 0;
  }
  if (command === 'packages') {
    configureNpm(env);
    const access = env.NODE_AUTH_TOKEN || env.CLAUDE_CODE_REMOTE === 'true' ? {} : await resolveDoppler({ env, interactive: process.stdin.isTTY });
    const pkg = await packagesToken(env, access);
    return runWith(cmd, { NODE_AUTH_TOKEN: pkg.token });
  }

  const hook = own.includes('--hook');
  const gaps = [];
  const goGap = configureGo({ required: own.includes('--require-go') });
  if (goGap) gaps.push(`go: ${goGap}`);
  configureNpm(env);
  const access = await resolveDoppler({ env, dispatch: !hook, interactive: !hook && process.stdin.isTTY }).catch((error) => ({ gap: error.message }));
  if (access.gap) gaps.push(`doppler: ${access.gap}`);
  if (access.token && scope) {
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
  const context = env.GITHUB_ACTIONS === 'true' ? { status: 'not-required', source: 'github-actions' } : personalContext(own.includes('--install'));
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
    printOwnerRules();
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
