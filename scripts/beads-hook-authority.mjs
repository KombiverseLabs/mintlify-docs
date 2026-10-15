#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function beadsCommandPrefix() {
  const configured = process.env.KOMBIFY_BEADS_COMMAND_JSON;
  if (!configured) {
    if (process.platform === "win32") {
      // npm exposes PowerShell/CMD shims that a shell-free Node child cannot
      // execute. Honor PATH order, using the packaged native binary instead.
      for (const entry of (process.env.PATH || "").split(";")) {
        const directory = entry.trim().replace(/^"(.*)"$/u, "$1");
        if (!directory) continue;
        for (const candidate of [
          resolve(directory, "bd.exe"),
          resolve(directory, "node_modules", "@beads", "bd", "bin", "bd.exe"),
        ]) {
          if (existsSync(candidate) && statSync(candidate).isFile()) return [candidate];
        }
      }
    }
    return ["bd"];
  }
  const parsed = JSON.parse(configured);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => typeof item !== "string")) {
    throw new Error("KOMBIFY_BEADS_COMMAND_JSON must be a non-empty JSON string array");
  }
  return parsed;
}

export function gitRemoteUrl(repositoryRoot) {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error("Cannot resolve the owning Git origin for Beads");
  }
  const url = result.stdout.trim();
  if (/^(?:https?|ssh):\/\//iu.test(url)) return `git+${remoteIdentityUrl(url).href}`;
  throw new Error("Beads requires an HTTPS or ssh:// Git origin");
}

function remoteIdentityUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid Beads Git remote URL");
  }
  if (!["http:", "https:", "ssh:"].includes(url.protocol)) {
    throw new Error("Unsupported Beads sync.remote transport");
  }
  // Git insteadOf may inject HTTP authentication. It is not repository
  // identity and must never be copied into the persisted Dolt remote.
  // SSH usernames remain part of routing (for example git@host).
  if (url.protocol === "http:" || url.protocol === "https:") {
    url.username = "";
    url.password = "";
  }
  return url;
}

function normalizedRemote(remote) {
  if (!remote.startsWith("git+")) throw new Error("Beads sync.remote must use the Git transport");
  const url = remoteIdentityUrl(remote.slice(4));
  url.pathname = url.pathname.replace(/\/$/u, "").replace(/\.git$/u, "");
  // GitHub repository paths are case-insensitive. A legacy lowercase
  // sync.remote written by an older bd init is the same repository as the
  // owning origin and must not fail the identity check.
  if (url.hostname.toLowerCase() === "github.com") url.pathname = url.pathname.toLowerCase();
  return url.href;
}

function databaseRemote(repositoryRoot, trackerDir) {
  const [command, ...prefix] = beadsCommandPrefix();
  const result = spawnSync(command, [...prefix, "--readonly", "-C", repositoryRoot, "dolt", "remote", "list", "--json"], {
    cwd: repositoryRoot,
    // Remote identity does not depend on the issue schema. bd 1.3 otherwise
    // refuses this read-only open while a schema migration is pending.
    env: { ...process.env, BEADS_DIR: trackerDir, BD_IGNORE_SCHEMA_SKEW: "1" },
    encoding: "utf8",
    windowsHide: true,
    timeout: 8_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Cannot read the owning Beads database remote");
  }
  let remotes;
  try {
    remotes = JSON.parse(result.stdout);
    if (!Array.isArray(remotes) || remotes.some((remote) => !remote || typeof remote !== "object")) throw new Error();
  } catch {
    throw new Error("Invalid Beads database remote metadata");
  }
  if (remotes.length === 0) return null;
  const origins = remotes.filter((remote) => remote.name === "origin");
  if (origins.length !== 1 || typeof origins[0].url !== "string") {
    throw new Error("Missing or ambiguous Beads database origin");
  }
  return origins[0].url;
}

// This is configuration evidence, not a remote-readiness or persistence receipt.
// The caller must first enforce the existing writable-target/worktree guard.
export function hookAuthority(repositoryRoot, trackerDir) {
  const metadataPath = resolve(trackerDir, "metadata.json");
  if (!existsSync(metadataPath)) return "legacy";
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
    if (!metadata || typeof metadata !== "object") throw new Error();
  } catch {
    throw new Error("Invalid Beads metadata");
  }
  if (metadata.backend === "cloudflare") return "remote";
  if (metadata.backend !== "dolt") return "legacy";
  return trackerRemoteSource(repositoryRoot, trackerDir) === "none" ? "legacy" : "remote";
}

const REMOTE_VALUE = /^[\t ]*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s"'#]+))[\t ]*(?:#.*)?$/u;

// A tracker config declares its remote either as the dotted key
// (`sync.remote: ...`) or as a nested block (`sync:` / `  remote: ...`), which
// the Companion adoption wrote. Each declaration yields its value, or "" when
// the value is unreadable.
function syncRemoteDeclarations(config) {
  const declarations = [];
  let inSyncBlock = false;
  for (const line of config.split(/\r?\n/u)) {
    if (/^[^\s#]/u.test(line)) inSyncBlock = /^sync[\t ]*:[\t ]*(?:#.*)?$/u.test(line);
    const key = /^[\t ]*sync\.remote[\t ]*:/u.exec(line) ?? (inSyncBlock ? /^[\t ]+remote[\t ]*:/u.exec(line) : null);
    if (!key) continue;
    const value = REMOTE_VALUE.exec(line.slice(key[0].length));
    declarations.push(value?.slice(1).find(Boolean) ?? "");
  }
  return declarations;
}

// Kombify hooks and the workspace writer share one remote-identity decision.
// repositoryRoot must be the tracker owner's Git root, not a redirecting consumer.
export function trackerRemoteSource(repositoryRoot, trackerDir) {
  const configPath = resolve(trackerDir, "config.yaml");
  const config = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const declarations = syncRemoteDeclarations(config);
  if (declarations.length === 0) {
    const remote = databaseRemote(repositoryRoot, trackerDir);
    if (remote === null) return "none";
    if (normalizedRemote(remote) !== normalizedRemote(gitRemoteUrl(repositoryRoot))) {
      throw new Error(
        `Beads database origin does not match the owning Git origin (expected ${normalizedRemote(gitRemoteUrl(repositoryRoot))})`,
      );
    }
    return "database";
  }
  const remote = declarations[0];
  if (declarations.length !== 1 || !remote) {
    throw new Error("Invalid or ambiguous Beads sync.remote declaration");
  }
  if (normalizedRemote(remote) !== normalizedRemote(gitRemoteUrl(repositoryRoot))) {
    throw new Error(
      `Beads sync.remote does not match the owning Git origin (expected ${normalizedRemote(gitRemoteUrl(repositoryRoot))})`,
    );
  }
  return "config";
}

// Node resolves module URLs through directory links; argv retains the invoked
// workspace path. Compare physical files so a junction still runs the CLI.
if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    if (process.argv.length !== 4)
      throw new Error("usage: beads-hook-authority.mjs <repository-root> <tracker-directory>");
    console.log(hookAuthority(process.argv[2], process.argv[3]));
  } catch (error) {
    console.error(`Beads hook authority could not be verified: ${error.message}`);
    process.exitCode = 1;
  }
}
