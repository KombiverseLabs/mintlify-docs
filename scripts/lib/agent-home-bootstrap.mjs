import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSign, randomUUID } from 'node:crypto';
import { ENV_GIT_HELPER, withoutTokenEnv } from './github-host-identity.mjs';
const appHelper = fileURLToPath(new URL('../kombify-bootstrap.mjs', import.meta.url));

const repository = 'Soulcreek/agent-home';
const sourceUrl = `https://github.com/${repository}.git`;
const origins = new Set([sourceUrl.toLowerCase(), sourceUrl.slice(0, -4).toLowerCase(), `git@github.com:${repository}.git`.toLowerCase()]);

// Installation, conflict handling and rollback belong to Agent Home's installer.
// This adapter only obtains its declared source and invokes that implementation.
// `bundle` ({ path, revision }): a git bundle of main that the broker workflow
// hands a Claude cloud session without the repository attached (the git proxy
// refuses it there); it stands in for the network clone and fetch, and origin
// keeps the repository's own URL.
export function prepareAgentHome({ home = homedir(), checkout, agents, device, install = false, refresh = install, bundle, run = spawnSync } = {}) {
  const targetHome = resolve(home);
  const receiptPath = join(targetHome, '.agents', 'agent-home', 'state.json');
  let receipt;
  try {
    if (existsSync(receiptPath)) receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    return { status: 'failed', code: 'agent_home_receipt_invalid', receipt: receiptPath };
  }
  const source = resolve(checkout || receipt?.repo_root || join(targetHome, '.agent-home'));
  const requestedAgents = agents === undefined ? null : agents.split(',');
  const supportedAgents = new Set(['codex', 'claude', 'cursor', 'opencode']);
  if (requestedAgents && (!requestedAgents.length || new Set(requestedAgents).size !== requestedAgents.length || requestedAgents.some(agent => !supportedAgents.has(agent)))) {
    return { status: 'failed', code: 'agent_home_agent_selection_invalid', source };
  }
  const canonical = (value) => {
    const path = existsSync(value) ? realpathSync(value) : resolve(value);
    return process.platform === 'win32' ? path.toLowerCase() : path;
  };
  if (!install) {
    if (!receipt?.repo_root) return { status: 'pending', code: 'agent_home_not_installed', source };
    if (canonical(receipt.repo_root) !== canonical(source)) return { status: 'pending', code: 'agent_home_checkout_selection_pending', source, installedSource: receipt.repo_root };
    if (requestedAgents?.some(agent => !receipt.agents?.includes(agent))) return { status: 'pending', code: 'agent_home_agent_selection_pending', source };
    if (device && device !== receipt.device) return { status: 'pending', code: 'agent_home_device_selection_pending', source };
  }
  const invoke = (command, args, timeout = 90_000) => run(command, args, {
    encoding: 'utf8', timeout, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' },
    maxBuffer: 4 * 1024 * 1024,
  });
  const failed = (step, result) => ({
    status: 'failed', code: /rate limit|rate_limit|API rate/i.test(String(result.stderr)) ? 'github_rate_limited' : step,
    source, exitCode: result.status ?? null, errorCode: result.error?.code,
    reason: String(result.stderr || '').match(/^(?:Refused: |agent-home-app: ).+$/m)?.[0].slice(0, 600),
  });
  if (!existsSync(source)) {
    if (!install) return { status: 'pending', code: 'agent_home_not_installed', source };
    mkdirSync(dirname(source), { recursive: true });
    const clone = bundle
      ? invoke('git', ['clone', '--quiet', '--branch', 'main', '--single-branch', bundle.path, source], 120_000)
      : invoke(process.execPath, [appHelper, '--personal-app', 'clone', source], 240_000);
    if (clone.error || clone.status !== 0) return failed('agent_home_source_access_failed', clone);
    if (bundle) {
      const named = invoke('git', ['-C', source, 'remote', 'set-url', 'origin', sourceUrl]);
      if (named.error || named.status !== 0) return failed('agent_home_source_access_failed', named);
    }
  }
  const git = (args) => invoke('git', ['-C', source, ...args]);
  const origin = git(['remote', 'get-url', 'origin']);
  if (origin.error || origin.status !== 0 || !origins.has(String(origin.stdout).trim().toLowerCase())) {
    return { status: 'failed', code: 'agent_home_source_identity_mismatch', source };
  }
  const branch = git(['branch', '--show-current']);
  const dirty = git(['status', '--porcelain', '--untracked-files=no']);
  if (branch.status !== 0 || dirty.status !== 0 || String(branch.stdout).trim() !== 'main' || String(dirty.stdout).trim()) {
    return { status: 'failed', code: 'agent_home_shared_source_unsettled', source };
  }
  if (refresh) {
    const fetched = bundle
      ? git(['fetch', '--quiet', bundle.path, '+refs/heads/main:refs/remotes/origin/main'])
      : invoke(process.execPath, [appHelper, '--personal-app', 'fetch', source], 240_000);
    if (fetched.error || fetched.status !== 0) return failed('agent_home_source_refresh_failed', fetched);
    const merged = git(['merge', '--ff-only', '--quiet', 'origin/main']);
    if (merged.error || merged.status !== 0) return failed('agent_home_source_diverged', merged);
  }
  const revision = git(['rev-parse', 'HEAD']);
  const upstream = git(['rev-parse', 'origin/main']);
  if (revision.status !== 0 || upstream.status !== 0 || revision.stdout !== upstream.stdout || (bundle && String(revision.stdout).trim() !== bundle.revision)) {
    return { status: 'failed', code: 'agent_home_source_not_current', source };
  }
  const installer = join(source, 'bootstrap', 'agent_home.py');
  if (!existsSync(installer)) return { status: 'failed', code: 'agent_home_installer_missing', source };
  const installerRevision = git(['rev-parse', 'HEAD:bootstrap/agent_home.py']);
  const installerBytes = git(['hash-object', '--', 'bootstrap/agent_home.py']);
  if (installerRevision.status !== 0 || installerBytes.status !== 0 || installerRevision.stdout !== installerBytes.stdout) {
    return { status: 'failed', code: 'agent_home_installer_source_changed', source };
  }
  let python;
  for (const command of process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']) {
    const probe = invoke(command, ['-I', '--version'], 15_000);
    const version = `${probe.stdout || ''}${probe.stderr || ''}`.match(/Python (\d+)\.(\d+)/);
    if (!probe.error && probe.status === 0 && version && (+version[1] > 3 || (+version[1] === 3 && +version[2] >= 10))) {
      python = { command, prefix: [] };
      break;
    }
  }
  // The existing tool manager installs a missing interpreter for this command;
  // no global Python or separate device installer is introduced.
  if (!python && install) python = { command: 'mise', prefix: ['exec', 'python@latest', '--', 'python'] };
  if (!python) return { status: 'pending', code: 'agent_home_python_unavailable', source };
  const selectedAgents = agents || receipt?.agents?.join(',');
  if (install) {
    const args = [...python.prefix, '-I', installer, 'install', '--home', targetHome, '--repo-root', source];
    if (selectedAgents) args.push('--agents', selectedAgents);
    if (device || receipt?.device) args.push('--device', device || receipt.device);
    const installed = invoke(python.command, args, 120_000);
    if (installed.error || installed.status !== 0) return failed('agent_home_install_refused', installed);
  }
  const doctor = invoke(python.command, [...python.prefix, '-I', installer, 'doctor', '--home', targetHome], 120_000);
  if (doctor.error || doctor.status !== 0) return failed('agent_home_doctor_failed', doctor);
  let installed;
  try { installed = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { return { status: 'failed', code: 'agent_home_receipt_invalid', source }; }
  if (!installed.repo_root || canonical(installed.repo_root) !== canonical(source)) return { status: 'failed', code: 'agent_home_receipt_binding_changed', source };
  return { status: 'ready', source: installed.repo_root, revision: installed.source_revision, agents: installed.agents.join(','), device: installed.device, receipt: receiptPath };
}

// Invoked only by the bootstrap child after all modules have initialized.
export async function personalAppOperation(args) {
  // Personal App: the key stays in scoped Doppler custody; the installation
  // token exists only in this process and the child environment for one operation.
  const scope = { project: 'kombination', config: 'dev_personal' };
  const names = ['SOULCREEK_AGENT_HOME_APP_ID', 'SOULCREEK_AGENT_HOME_INSTALLATION_ID', 'SOULCREEK_AGENT_HOME_APP_PRIVATE_KEY'];
  const [operation, path] = args;
  const origin = 'https://github.com/Soulcreek/agent-home.git';
  const started = performance.now();
  const issuanceStartLimitMs = 60_000;
  let token = '';
  let outcome = 1;
  try {
    if (!['clone', 'fetch', 'rules'].includes(operation) || (operation !== 'rules' && !path) || args.length !== (operation === 'rules' ? 1 : 2)) throw new Error('invalid Agent Home operation');
    const { dopplerSecret } = await import('../kombify-bootstrap.mjs');
    const [appId, installationId, privateKey] = await Promise.all(names.map(async name => (await dopplerSecret({ ...scope, name })).value));
    if (appId !== '5569861' || installationId !== '177595171') throw new Error('personal App custody identity mismatch');
    // Do not begin an issuance too late for the parent to reserve time for
    // the bounded operation and mandatory token revocation.
    if (performance.now() - started > issuanceStartLimitMs) throw new Error('personal App custody lookup timed out before issuance');
    const clock = await fetch(`https://api.github.com/rate_limit?app-clock=${randomUUID()}`, { redirect: 'error', headers: { accept: 'application/vnd.github+json', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20_000) });
    const clockDate = clock.headers.get('date');
    const clockMs = Date.parse(clockDate ?? '');
    if (clock.status !== 200 || !Number.isFinite(clockMs) || new Date(clockMs).toUTCString() !== clockDate) throw new Error('GitHub signing clock is unproven');
    const now = Math.floor(clockMs / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: appId })}`;
    const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey.replace(/\\n/g, '\n')).toString('base64url')}`;
    const issued = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: 'POST', headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'kombify-agent-home' }, body: JSON.stringify({ repositories: ['agent-home'], permissions: { contents: 'read' } }), redirect: 'error', signal: AbortSignal.timeout(20_000) });
    const minted = await issued.json();
    minted.status = issued.status;
    token = typeof minted.token === 'string' ? minted.token : '';
    if (minted.status !== 201 || !token) throw new Error(`personal App token request failed (HTTP ${minted.status})`);
    const grants = minted.permissions;
    if (grants.contents !== 'read' || Object.entries(grants).some(([name, level]) => !(['contents', 'metadata'].includes(name) && level === 'read')) || !Number.isFinite(Date.parse(minted.expires_at)) || Date.parse(minted.expires_at) <= Date.now()) throw new Error('personal App token grants invalid');
    const inventory = await fetch('https://api.github.com/installation/repositories?per_page=100', { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'kombify-agent-home' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    const repos = await inventory.json();
    if (!inventory.ok || repos.total_count !== 1 || repos.repositories?.length !== 1 || repos.repositories[0].id !== 1390567452 || repos.repositories[0].full_name !== 'Soulcreek/agent-home' || repos.repositories[0].owner?.id !== 66470179) throw new Error('personal App repository grant mismatch');
    const env = { ...withoutTokenEnv(process.env), KOMBIFY_GIT_TOKEN: token, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' };
    const git = (args, timeout = 45_000) => spawnSync('git', args, { encoding: 'utf8', env, timeout, windowsHide: true });
    const auth = ['-c', 'credential.helper=', '-c', 'credential.https://github.com.helper=', '-c', `credential.https://github.com.helper=${ENV_GIT_HELPER}`, '-c', 'url.https://github.com/.insteadOf=git@github.com:'];
    let result;
    if (operation === 'rules') {
      const response = await fetch('https://api.github.com/repos/Soulcreek/agent-home/contents/standards/rules.md', { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github.raw', 'user-agent': 'kombify-agent-home' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`personal App rules read failed (HTTP ${response.status})`);
      process.stdout.write(await response.text());
      outcome = 0;
    } else {
      if (operation === 'fetch') {
        const remote = git(['-C', path, 'remote', 'get-url', 'origin'], 5_000);
        const allowed = new Set([origin.toLowerCase(), origin.slice(0, -4).toLowerCase(), 'git@github.com:soulcreek/agent-home.git']);
        if (remote.status !== 0 || !allowed.has(String(remote.stdout).trim().toLowerCase())) throw new Error('Agent Home origin mismatch');
      }
      result = operation === 'clone' ? git([...auth, 'clone', '--branch', 'main', '--single-branch', origin, path]) : git(['-C', path, ...auth, 'fetch', '--quiet', 'origin', 'main']);
      if (result.error || result.status !== 0) throw new Error(`personal App ${operation} failed (exit ${result.status ?? 'unknown'})`);
      outcome = 0;
    }
} catch (error) {
  process.stderr.write(`agent-home-app: ${error.message}\n`);
} finally {
  if (token) {
    try {
      const response = await fetch('https://api.github.com/installation/token', { method: 'DELETE', headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'kombify-agent-home' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
      if (response.status !== 204) { process.stderr.write(`agent-home-app: token revocation unconfirmed (HTTP ${response.status})\n`); outcome = 1; }
    } catch { process.stderr.write('agent-home-app: token revocation unconfirmed\n'); outcome = 1; }
  }
}
return outcome;
}
