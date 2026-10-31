#!/usr/bin/env node

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

export function hookAuthority(_repositoryRoot, trackerDir) {
  const metadata = JSON.parse(readFileSync(resolve(trackerDir, "metadata.json"), "utf8"));
  if (metadata?.backend !== "cloudflare") throw new Error("Native Cloudflare bootstrap required; no local tracker authority is supported");
  return "remote";
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
