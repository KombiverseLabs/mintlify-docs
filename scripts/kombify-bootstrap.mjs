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
//     3. Claude cloud session: the GitHub-OIDC broker of kombify-workspace
//        (cloud-doppler-session.mjs, §6b), fetched with `gh` when absent;
//     4. GitHub Actions: none; CI uses its repository secrets (§4);
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
//   flags: --project P --config C override the repository scope.
//
// Prints names, sources and statuses only, never a secret value.
// KOMBIFY_BOOTSTRAP_SKIP=1 disables it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

async function loadBroker() {
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

// Finds the Doppler token for this environment. `dispatch: false` (the hook)
// never starts a broker run; the first command that needs secrets does.
export async function resolveDoppler({ env = process.env, root = ROOT, dispatch = true, interactive = false, cli = cliToken, broker = loadBroker } = {}) {
  if (env.DOPPLER_TOKEN) return { source: 'env', token: env.DOPPLER_TOKEN };
  const fromCli = cli(root);
  if (fromCli.token) return { source: 'cli', token: fromCli.token };
  if (env.CLAUDE_CODE_REMOTE === 'true') {
    const mod = await broker();
    const cached = mod.readCache?.();
    if (cached) return { source: 'cloud-broker', token: cached.token };
    if (!dispatch) return { source: 'cloud-broker', pending: true };
    const record = await mod.login();
    return { source: 'cloud-broker', token: record.token };
  }
  if (env.GITHUB_ACTIONS === 'true') {
    return { source: 'github-actions', skipped: 'GitHub Actions uses its repository secrets, not Doppler (SECRETS-ACCESS-STANDARD.md §4); pass DOPPLER_TOKEN explicitly for an operator-only job' };
  }
  if (interactive && !fromCli.missing) {
    spawnSync('doppler', ['login', '--scope', root], { stdio: 'inherit' });
    const after = cli(root);
    if (after.token) return { source: 'cli', token: after.token };
  }
  return {
    gap: fromCli.missing
      ? 'Doppler CLI not installed: `mise use -g doppler@latest` (or https://docs.doppler.com/docs/install-cli), then `doppler login`'
      : 'Doppler CLI not signed in: run `doppler login` once on this host (browser approval, nothing to copy)',
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

function configureGo() {
  const go = spawnSync('go', ['env', '-w', `GOPRIVATE=${PRIVATE_GO}`, `GONOSUMDB=${PRIVATE_GO}`], { encoding: 'utf8' });
  if (go.error) return null;
  return go.status === 0 ? null : `go env -w failed: ${go.stderr.trim()}`;
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

  if (command === 'run') {
    if (!scope) throw new Error('no Doppler scope: add .kombify/secrets.json (secrets-bootstrap-marker.mjs) or pass --project and --config');
    const access = await resolveDoppler({ env, interactive: process.stdin.isTTY });
    if (!access.token) throw new Error(access.gap ?? access.skipped);
    const secrets = await secretsOf(access.token, scope);
    return runWith(cmd, { ...secrets, DOPPLER_TOKEN: access.token, DOPPLER_PROJECT: scope.project, DOPPLER_CONFIG: scope.config });
  }
  if (command === 'packages') {
    configureNpm(env);
    const access = env.NODE_AUTH_TOKEN || env.CLAUDE_CODE_REMOTE === 'true' ? {} : await resolveDoppler({ env, interactive: process.stdin.isTTY });
    const pkg = await packagesToken(env, access);
    return runWith(cmd, { NODE_AUTH_TOKEN: pkg.token });
  }

  const hook = own.includes('--hook');
  const gaps = [];
  const goGap = configureGo();
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
  const scopeText = scope ? `${scope.project}/${scope.config}` : 'none';
  const dopplerText = access.source ? `${access.source}${access.pending ? '(on-demand)' : ''}${access.skipped ? '(repository-secrets)' : ''}` : 'missing';
  for (const gap of gaps) console.log(`KOMBIFY_BOOTSTRAP_GAP ${gap}`);
  if (!gaps.length) console.log(`KOMBIFY_BOOTSTRAP_OK doppler=${dopplerText} scope=${scopeText} goprivate=${PRIVATE_GO}`);
  if (hook) {
    const rel = 'scripts/kombify-bootstrap.mjs';
    console.log(`Install: node ${rel} --install. Secrets for a command: node ${rel} run -- <cmd>. Package token for a command: node ${rel} packages -- <cmd>. Tokens are fetched on demand; never report a missing NODE_AUTH_TOKEN or DOPPLER_TOKEN as a blocker.`);
  }
  return gaps.length && !hook ? 1 : 0;
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
