#!/usr/bin/env node
// SessionStart-safe installer of pinned Cloudflare bd for every clone/host.
// Quiet no-op when the pinned versions already resolve; never uses sudo and
// never writes into the repository. --check reports without installing;
// KOMBIFY_BEADS_TOOLS_SKIP=1 disables it; KOMBIFY_BEADS_TOOLS_DIR overrides
// the install directory (default $HOME/.local/bin). --with-comparison adds the
// optional bd-dolt/Dolt tools for retained read-only comparison snapshots.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, chmodSync, copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executableName, pinnedTools, platformKey, stageTool } from './beads-bridge-tools-lib.mjs';

const versionArgs = { bd: ['--version'], dolt: ['version'] };
export const toolsDirectory = (env = process.env) => resolve(env.KOMBIFY_BEADS_TOOLS_DIR || resolve(homedir(), '.local/bin'));

// `bd version 1.3.1+cloudflare.19ee335 (...)` -> `1.3.1+cloudflare.19ee335`.
export const parseVersion = text => /\b(\d+\.\d+\.\d+(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?)/.exec(String(text ?? ''))?.[1] ?? null;

// Pinned and found versions are equal only including the build suffix.
export const sameVersion = (pinned, found) => Boolean(found) && String(pinned).replace(/^v/, '') === found;

// Version of the binary the session resolves, with the install dir first.
export function installedVersion(binary, dir, env = process.env) {
  const result = spawnSync(resolve(dir, executableName(binary)), versionArgs[binary] ?? ['--version'], {
    encoding: 'utf8', timeout: 10000, env: { ...env, PATH: [dir, env.PATH ?? ''].join(delimiter) },
  });
  return result.status === 0 ? parseVersion(result.stdout) : null;
}

// Stages and verifies every missing tool before installing any of them, so a
// checksum mismatch leaves the install directory untouched.
export async function installTools(tools, dir, { fetchImpl = fetch, tokenImpl, log = console.log } = {}) {
  const work = mkdtempSync(resolve(tmpdir(), 'kombify-beads-tools-'));
  try {
    const staged = [];
    for (const tool of tools) staged.push([tool, await stageTool(tool, work, { fetchImpl, ...(tokenImpl ? { tokenImpl } : {}) })]);
    mkdirSync(dir, { recursive: true });
    for (const [tool, path] of staged) {
      const target = resolve(dir, executableName(tool.binary));
      const temporary = `${target}.kombify-new-${randomUUID()}`;
      copyFileSync(path, temporary);
      chmodSync(temporary, 0o755);
      renameSync(temporary, target);
      log(`Verified ${tool.binary} ${tool.version} (sha256 ${tool.sha256.slice(0, 12)}) -> ${target}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function ensureSessionTools(argv = []) {
  if (process.env.KOMBIFY_BEADS_TOOLS_SKIP === '1') return 0;
  const check = argv.includes('--check');
  const tools = pinnedTools(platformKey(), { optional: argv.includes('--with-comparison') || argv.includes('--with-bd-cf') });
  if (!tools) {
    console.error(`beads-session-tools: unsupported platform ${platformKey()}; no pinned bd/dolt in internal/planning/beads-bridge-tools.json`);
    return 1;
  }
  const dir = toolsDirectory();
  const missing = tools.filter(tool => !sameVersion(tool.version, installedVersion(tool.binary, dir)));
  if (check) {
    for (const tool of tools) {
      const found = installedVersion(tool.binary, dir);
      console.log(`${tool.binary}: pinned ${tool.version}, found ${found ?? 'none'} (${sameVersion(tool.version, found) ? 'ok' : 'install needed'})`);
    }
    return missing.length ? 1 : 0;
  }
  if (!missing.length) return 0;
  try {
    await installTools(missing, dir);
  } catch (error) {
    console.error(`beads-session-tools: install failed closed, nothing installed: ${error.message}`);
    return 1;
  }
  const onPath = (process.env.PATH ?? '').split(delimiter).some(entry => entry && resolve(entry) === dir);
  if (!onPath && process.env.CLAUDE_ENV_FILE) appendFileSync(process.env.CLAUDE_ENV_FILE, `export PATH="${dir}${delimiter}$PATH"\n`);
  else if (!onPath) console.log(`beads-session-tools: tools are usable by absolute path at ${dir}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await ensureSessionTools(process.argv.slice(2));
