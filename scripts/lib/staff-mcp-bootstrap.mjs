import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const repository = 'KombiverseLabs/kombify-Plugins';
const origin = `https://github.com/${repository}.git`;
const sourcePaths = ['package.json', 'tooling/install-kombify-mcp.mjs', 'tooling/kombify-mcp-auth.mjs', 'tooling/codex-mcp-host.mjs', 'tooling/cursor-mcp-config.mjs'];

// Codex chooses its native configuration with CODEX_HOME. Broker/cache/runtime
// overrides are separate authorities and are not silently redirected to default.
export function staffMcpEnvironment(env = process.env) {
  for (const [key, code] of [
    ['KOMBIFY_MCP_HOME', 'mcp_custom_broker_home_unsupported'],
    ['KOMBIFY_MCP_STATE_DIR', 'mcp_custom_broker_state_unsupported'],
    ['KOMBIFY_MCP_SDK_RUNTIME_ROOT', 'mcp_custom_sdk_runtime_unsupported'],
  ]) {
    if (Object.entries(env).some(([name, value]) => name.toUpperCase() === key && value !== undefined && value !== '')) {
      const error = new Error(code); error.code = code; throw error;
    }
  }
  if (env.CODEX_HOME !== undefined && (typeof env.CODEX_HOME !== 'string' || !isAbsolute(env.CODEX_HOME))) {
    const error = new Error('mcp_codex_home_invalid'); error.code = error.message; throw error;
  }
  return Object.fromEntries(Object.entries(env).filter(([key]) => /^(PATH|PATHEXT|COMSPEC|HOME|USERPROFILE|SYSTEMROOT|WINDIR|TEMP|TMP|APPDATA|LOCALAPPDATA|XDG_CONFIG_HOME|XDG_CACHE_HOME|CODEX_HOME|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS|HTTPS_PROXY|HTTP_PROXY|NO_PROXY)$/i.test(key)));
}

// Only an explicit bootstrap may replace a confirmed rejected CURRENT issuer
// credential. Native checks never dispatch; the bounded receipt contains no value.
export async function checkStaffMcpSession({ check, session, source, install = false }) {
  const read = () => { const checked = check(); let proof; try { proof = JSON.parse(checked.stdout); } catch { /* caller reports unreadable receipt */ } return { checked, proof }; };
  let result = read();
  const failure = result.proof?.credential_failure;
  if (install && session && !result.checked.error && result.checked.status !== 0 && result.proof?.ready === false
      && result.proof.host === 'codex' && result.proof.credential_source === 'github-session'
      && failure?.code === 'mcp_github_session_rejected' && failure.http_status === 401
      && failure.profile === 'codex' && failure.source_sha256 === source?.sha256
      && /^[0-9a-f]{64}$/.test(failure.token_fingerprint ?? '')) {
    const current = session.readCache();
    if (typeof current?.token === 'string' && createHash('sha256').update(current.token).digest('hex') === failure.token_fingerprint) {
      try { await session.login({ force: true }); }
      catch { return { checked: result.checked, proof: { ...result.proof, capability_code: 'mcp_github_session_preparation_failed' } }; }
      result = read();
    }
  }
  return result;
}

// Obtains the owning installer; registration, SDK policy and actual host proof
// remain in Plugins. No provider credential/config is returned by this adapter.
export async function prepareStaffMcp({ root, host, checkout, credentialSource, githubSession, install = false, run = spawnSync, env = process.env } = {}) {
  if (env.GITHUB_ACTIONS === 'true') return { status: 'not-required', code: 'mcp_staff_host_not_ci' };
  const selected = host ?? (env.CODEX_THREAD_ID ? 'codex' : undefined);
  if (selected !== 'codex') return { status: 'pending', code: selected ? 'mcp_selected_host_unsupported' : 'mcp_host_selection_pending' };
  if (credentialSource !== undefined && credentialSource !== 'github-session') return { status: 'pending', code: 'mcp_credential_source_unsupported', host: selected };
  let childEnv;
  try { childEnv = staffMcpEnvironment(env); }
  catch (error) { return { status: 'pending', code: error.code, host: selected }; }
  const sibling = [join(root, 'kombify-Plugins'), join(dirname(root), 'kombify-Plugins')].find(p => existsSync(join(p, '.git')));
  const source = resolve(checkout || sibling || join(homedir(), '.kombify', 'plugins-source'));
  const invoke = (command, args, cwd = root, timeout = 60_000, github = false, input) => run(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 1024 * 1024, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], ...(input === undefined ? {} : { input }), env: { ...childEnv, ...(github ? Object.fromEntries(['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR'].filter(k => env[k]).map(k => [k, env[k]])) : {}), GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' } });
  const authentication = ['-c', 'credential.https://github.com.helper=', '-c', 'credential.https://github.com.helper=!gh auth git-credential'];
  const pending = code => ({ status: 'pending', code, host: selected, source });
  if (!existsSync(source)) {
    if (!install) return pending('mcp_plugins_source_missing');
    mkdirSync(dirname(source), { recursive: true });
    const cloned = invoke('git', [...authentication, 'clone', '--branch', 'main', '--single-branch', origin, source], root, 60_000, true);
    if (cloned.error || cloned.status !== 0) return pending('mcp_plugins_source_access_failed');
  }
  const git = args => invoke('git', ['-C', source, ...args], root, 60_000, true);
  const remote = git(['remote', 'get-url', 'origin']);
  if (remote.status !== 0 || ![origin, origin.slice(0, -4), `git@github.com:${repository}.git`].some(url => url.toLowerCase() === remote.stdout.trim().toLowerCase())) return pending('mcp_plugins_source_identity_mismatch');
  const branch = git(['branch', '--show-current']);
  if (branch.status !== 0 || branch.stdout.trim() !== 'main') return pending('mcp_plugins_source_not_main');
  if (install) {
    const fetch = git([...authentication, 'fetch', '--quiet', 'origin', 'main']);
    if (fetch.error || fetch.status !== 0) return pending('mcp_plugins_source_refresh_failed');
    const merge = git(['merge', '--ff-only', '--quiet', 'origin/main']);
    if (merge.error || merge.status !== 0) return pending('mcp_plugins_source_shared_unsettled');
  }
  const head = git(['rev-parse', 'HEAD']), upstream = git(['rev-parse', 'origin/main']);
  if (head.status !== 0 || upstream.status !== 0 || head.stdout !== upstream.stdout) return pending('mcp_plugins_source_not_current');
  const dirty = git(['status', '--porcelain', '--', ...sourcePaths]);
  if (dirty.status !== 0 || dirty.stdout.trim()) return pending('mcp_plugins_source_unpublished');
  if (sourcePaths.some(p => !existsSync(join(source, p)))) return pending('mcp_plugins_bootstrap_adapter_unavailable');
  let sessionSource, session;
  if (credentialSource === 'github-session') {
    try {
      if (typeof githubSession !== 'function') return pending('mcp_github_session_source_unavailable');
      session = await githubSession();
      // Only this explicit setup stage may wait for the existing workflow. The
      // native initialize path never dispatches or receives its broad token.
      if (install) await session.login();
      else if (!session.readCache()) return pending('mcp_github_session_preparation_pending');
      sessionSource = session.source;
    } catch (error) { return pending(/^mcp_[a-z_]+$/.test(error.message) ? error.message : 'mcp_github_session_preparation_failed'); }
  }
  const installer = join(source, 'tooling', 'install-kombify-mcp.mjs');
  {
    const installed = invoke(process.execPath, [installer, '--codex-staff', ...(sessionSource ? ['--github-session'] : []), ...(!install ? ['--check'] : [])], source, 60_000, false, sessionSource ? JSON.stringify(sessionSource) : undefined);
    if (installed.error || installed.status !== 0) {
      let receipt; try { receipt = JSON.parse(installed.stdout); } catch { /* exact pending below */ }
      return pending(/^[a-z_]{1,100}$/.test(receipt?.code ?? '') ? receipt.code : 'mcp_installer_failed');
    }
  }
  const broker = join(homedir(), '.config', 'kombify-mcp', 'current', 'kombify-mcp-auth.mjs');
  if (!existsSync(broker)) return pending('mcp_broker_not_installed');
  const { checked, proof } = await checkStaffMcpSession({ check: () => invoke(process.execPath, [broker, 'check', 'staff', '--host', 'codex', '--profile', 'codex', '--isolated-state', '--doppler-project', 'kombify-io', '--doppler-config', 'dev_shared_test_users'], root), session, source: sessionSource, install });
  if (!proof) return pending('mcp_native_receipt_unreadable');
  if (checked.error || checked.status !== 0 || proof?.ready !== true || proof.configuration !== 'passed' || proof.execution !== 'passed' || proof.credential_renewal !== 'passed' || proof.state_boundary !== 'empty_isolated_native_cache' || (credentialSource === 'github-session' && proof.credential_source !== credentialSource)) {
    return { ...pending(proof?.capability_code ?? 'mcp_native_machine_renewal_or_execution_pending'), failed_stage: proof?.failed_stage, credential_renewal: 'pending', repair_command: 'node scripts/kombify-bootstrap.mjs mcp --mcp-host codex --mcp-credential-source github-session --install' };
  }
  return { status: 'ready', host: selected, source, revision: head.stdout.trim(), sdk: proof.sdk, credential_source: proof.credential_source, ...(proof.github_session_source ? { github_session_source: proof.github_session_source } : {}), configuration: proof.configuration, discovery: proof.discovery, execution: proof.execution, credential_renewal: proof.credential_renewal, state_boundary: proof.state_boundary, checked_at: proof.checked_at };
}
