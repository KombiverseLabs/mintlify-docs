// Shared download, checksum and extraction logic for the pinned Beads tools in
// internal/planning/beads-bridge-tools.json (Actions bridge and session installer).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const platformKey = (platform = process.platform, arch = process.arch) => `${platform}-${arch}`;
export const executableName = (binary, platform = process.platform) => (platform === 'win32' ? `${binary}.exe` : binary);
const BOOTSTRAP_FILES = new Set(['.kombify/beads-cloudflare.json', 'scripts/beads-cloudflare-access.mjs', 'scripts/lib/beads-github-auth.mjs', 'scripts/beads-session-tools.mjs', 'scripts/beads-bridge-tools-lib.mjs', 'internal/planning/beads-bridge-tools.json']);

// Generated bootstrap files have a source-only syntax/JSON gate in every repo.
export function bootstrapSourceChecks(files, fileExists = () => true) {
  return [...new Set(files.map(file => file.replaceAll('\\','/')))].filter(file => BOOTSTRAP_FILES.has(file) && fileExists(file)).map(file => ({command:'node',args:file.endsWith('.json') ? ['-e', "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))", file] : ['--check',file]}));
}

// Entries marked optional are comparison tools. Only native Cloudflare bd is
// required for operational access; retained Dolt is installed on explicit request.
export function pinnedTools(key = platformKey(), { optional = false } = {}) {
  const tools = JSON.parse(readFileSync(resolve(workspaceRoot, 'internal/planning/beads-bridge-tools.json')))[key];
  return tools?.filter(tool => optional || !tool.optional);
}

// Token for `"auth":"github"` downloads of a private release asset. The value is
// never logged; a failure names the sources only. A value that is not visible
// ASCII without whitespace (for example one carrying CR/LF) is rejected with a
// fixed message, because Node's header validation would otherwise embed the
// whole Authorization value in its exception.
const TOKEN_SHAPE = /^[!-~]+$/;
export function githubToken({ env = process.env, spawn = spawnSync } = {}) {
  let found = '';
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN']) if (!found && env[name]) found = String(env[name]).trim();
  if (!found) {
    const result = spawn('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    found = result.status === 0 ? String(result.stdout ?? '').trim() : '';
  }
  if (!found) throw new Error('No GitHub token for the release download: set GH_TOKEN or GITHUB_TOKEN, or sign in with `gh auth login`');
  if (!TOKEN_SHAPE.test(found)) throw new Error('The GitHub token for the release download is malformed (it must be visible ASCII without whitespace); the value is not shown');
  return found;
}

// Downloads one pinned asset into dir, verifies its sha256 before anything is
// extracted, and returns the path of the single extracted executable. A gzip or
// zip asset is extracted; any other verified asset is the executable itself.
export async function stageTool(tool, dir, { fetchImpl = fetch, tokenImpl = githubToken } = {}) {
  const headers = {};
  if (tool.auth === 'github') {
    const token = tokenImpl();
    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) throw new Error('The GitHub token for the release download is malformed (it must be visible ASCII without whitespace); the value is not shown');
    headers.Accept = 'application/octet-stream';
    headers.Authorization = `Bearer ${token}`;
  }
  // The exception of a failed request may embed header values: report a fixed text only.
  let response;
  try {
    response = await fetchImpl(tool.url, { headers, signal: AbortSignal.timeout(120000) });
  } catch {
    throw new Error(`Tool download failed: ${tool.binary} (request error, no response)`);
  }
  if (!response.ok) throw new Error(`Tool download failed: ${tool.binary} HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== tool.sha256) throw new Error(`Tool checksum mismatch: ${tool.binary}`);
  const extracted = resolve(dir, tool.binary);
  // "member" names the executable inside the asset when the installed name differs (bd-cf).
  const executable = executableName(tool.member ?? tool.binary);
  mkdirSync(extracted, { recursive: true, mode: 0o700 });
  const archived = (data[0] === 0x1f && data[1] === 0x8b) || (data[0] === 0x50 && data[1] === 0x4b);
  if (!archived) {
    const raw = resolve(extracted, executable);
    writeFileSync(raw, data, { mode: 0o700 });
    chmodSync(raw, 0o700);
    return raw;
  }
  const archive = resolve(dir, `${tool.binary}.archive`);
  writeFileSync(archive, data, { mode: 0o600 });
  // tar detects gzip archives, and bsdtar on Windows zip archives, on extraction.
  // A Git Bash session puts GNU tar first on PATH, which cannot read zip, so
  // Windows names the system bsdtar explicitly.
  const systemTar = process.platform === 'win32' ? resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  if (spawnSync(systemTar, ['-xf', archive, '-C', extracted]).status !== 0) throw new Error('Verified tool extraction failed');
  const matches = [];
  function find(path) { for (const entry of readdirSync(path, { withFileTypes: true })) { const next = resolve(path, entry.name); if (entry.isDirectory()) find(next); else if (entry.isFile() && entry.name === executable) matches.push(next); } }
  find(extracted);
  if (matches.length !== 1) throw new Error('Ambiguous tool binary');
  return matches[0];
}
