import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
  // Resolve Git authentication from the host's admitted gh identity per command.
  // No helper config, token, URL or repository-API lookup is persisted/required.
  const githubAuthentication = ['-c', 'credential.https://github.com.helper=',
    '-c', 'credential.https://github.com.helper=!gh auth git-credential',
    '-c', 'url.https://github.com/.insteadOf=git@github.com:'];
  const failed = (step, result) => ({
    status: 'failed', code: /rate limit|rate_limit|API rate/i.test(String(result.stderr)) ? 'github_rate_limited' : step,
    source, exitCode: result.status ?? null, errorCode: result.error?.code,
    reason: String(result.stderr || '').match(/^Refused: .+$/m)?.[0].slice(0, 600),
  });
  if (!existsSync(source)) {
    if (!install) return { status: 'pending', code: 'agent_home_not_installed', source };
    mkdirSync(dirname(source), { recursive: true });
    const clone = bundle
      ? invoke('git', ['clone', '--quiet', '--branch', 'main', '--single-branch', bundle.path, source], 120_000)
      : invoke('git', [...githubAuthentication, 'clone', '--branch', 'main', '--single-branch', sourceUrl, source], 120_000);
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
      : git([...githubAuthentication, 'fetch', '--quiet', 'origin', 'main']);
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
