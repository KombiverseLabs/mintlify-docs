#!/usr/bin/env node
// Canonical source: kombify-workspace/scripts/repo-context.mjs. Projected, not forked.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(binary, args, cwd = root) {
  const r = spawnSync(binary, args, {
    cwd,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" },
  });
  if (r.error || r.status !== 0)
    throw new Error(
      `${binary} ${args[0]} failed (${r.error?.code || r.status}); check authenticated access, network and repository scope. No fallback source was used.`,
    );
  return r.stdout.trimEnd();
}
function safePath(value) {
  const hasAsciiControl =
    typeof value === "string" && [...value].some((character) => character.codePointAt(0) <= 0x1f);
  if (
    typeof value !== "string" ||
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((p) => !p || p === ".." || p === ".") ||
    /[:?#]/.test(value) ||
    hasAsciiControl
  )
    throw new Error("Expected a repository-relative file path without traversal.");
  return value;
}
function source(config, id) {
  const value = config.sources[id];
  if (
    !value ||
    !/^KombiverseLabs\/[A-Za-z0-9_.-]+$/.test(value.repository) ||
    typeof value.ref !== "string" ||
    !/^[A-Za-z0-9_./-]+$/.test(value.ref) ||
    value.ref.startsWith("-")
  )
    throw new Error("Source must be a declared KombiverseLabs repository and ref.");
  return value;
}
function exact(target, override) {
  if (override && !/^[0-9a-f]{40}$/.test(override))
    throw new Error("Optional revision must be a full lowercase commit SHA.");
  const sha = run("gh", [
    "api",
    `repos/${target.repository}/commits/${encodeURIComponent(override || target.ref)}`,
    "--jq",
    ".sha",
  ]);
  if (!/^[0-9a-f]{40}$/.test(sha) || (override && sha !== override))
    throw new Error("GitHub did not return the requested exact commit.");
  return sha;
}
try {
  const config = JSON.parse(readFileSync(join(root, ".kombify/context.json"), "utf8"));
  if (config.schema_version !== 1 || !config.sources)
    throw new Error("Unsupported repository context schema.");
  const [command = "inspect", id, pathOrSha, requestedSha] = process.argv.slice(2);
  if (command === "inspect") {
    const entry = config.entrypoints.map((path) => ({
      path,
      available: existsSync(join(root, safePath(path))),
    }));
    const dependencyFiles = run("git", ["ls-files", "-z"])
      .split("\0")
      .filter((p) =>
        /(^|\/)(go\.mod|go\.sum|go\.work|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|package-lock\.json|Cargo\.toml|Cargo\.lock|pyproject\.toml|uv\.lock|mise\.toml)$/.test(
          p,
        ),
      );
    const localModuleOverrides = dependencyFiles
      .filter((p) => p.endsWith("go.mod") && existsSync(join(root, p)))
      .flatMap((path) =>
        readFileSync(join(root, path), "utf8")
          .split(/\r?\n/)
          .filter((line) => /=>\s+\.{1,2}[/]/.test(line))
          .map((line) => `${path}: ${line}`),
      );
    console.log(
      JSON.stringify(
        {
          repository: config.repository,
          checkout_sha: run("git", ["rev-parse", "HEAD"]),
          branch: run("git", ["branch", "--show-current"]) || "(detached)",
          git_root: run("git", ["rev-parse", "--show-toplevel"]),
          dirty: Boolean(run("git", ["status", "--porcelain"])),
          entrypoints: entry,
          dependency_files: dependencyFiles,
          local_module_overrides: localModuleOverrides,
          sources: config.sources,
          next: config.next,
          scope:
            "Context routing only. Does not verify dependencies installed, connector authorization, tracker persistence, index freshness or runtime readiness.",
        },
        null,
        2,
      ),
    );
    if (entry.some((e) => !e.available)) process.exitCode = 1;
  } else if (command === "read") {
    const target = source(config, id);
    const path = safePath(pathOrSha);
    const sha = exact(target, requestedSha);
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const result = JSON.parse(
      run("gh", ["api", `repos/${target.repository}/contents/${encoded}?ref=${sha}`]),
    );
    if (
      result.type !== "file" ||
      result.encoding !== "base64" ||
      typeof result.content !== "string"
    )
      throw new Error(
        "Exact source is not an inline file; directory, symlink and oversized responses are not source evidence. Use an explicit checkout.",
      );
    const content = Buffer.from(result.content, "base64").toString("utf8");
    if (!content.trim()) throw new Error("Source is empty; it cannot satisfy context retrieval.");
    console.log(
      JSON.stringify(
        {
          repository: target.repository,
          sha,
          path,
          source_url: `https://github.com/${target.repository}/blob/${sha}/${encoded}`,
          content,
        },
        null,
        2,
      ),
    );
  } else if (command === "checkout") {
    const target = source(config, id);
    const sha = exact(target, pathOrSha);
    const cache = join(root, ".kombify/context-cache");
    if (
      lstatSync(join(root, ".kombify")).isSymbolicLink() ||
      (existsSync(cache) && lstatSync(cache).isSymbolicLink())
    )
      throw new Error("Context cache must not be a symlink or junction.");
    mkdirSync(cache, { recursive: true });
    const destination = mkdtempSync(join(cache, "source-"));
    // New isolated directory only. Never reset or reuse the user's checkout.
    run("git", ["init", "--quiet", destination]);
    run(
      "git",
      ["remote", "add", "origin", `https://github.com/${target.repository}.git`],
      destination,
    );
    run(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "credential.helper=!gh auth git-credential",
        "-c",
        "credential.interactive=never",
        "fetch",
        "--quiet",
        "--filter=blob:none",
        "--depth=1",
        "origin",
        sha,
      ],
      destination,
    );
    run(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "credential.helper=!gh auth git-credential",
        "checkout",
        "--quiet",
        "--detach",
        "FETCH_HEAD",
      ],
      destination,
    );
    if (run("git", ["rev-parse", "HEAD"], destination) !== sha)
      throw new Error("Checkout revision mismatch.");
    writeFileSync(
      join(destination, ".git", "kombify-context-receipt.json"),
      JSON.stringify(
        { repository: target.repository, sha, purpose: "reference-only", source_id: id },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          repository: target.repository,
          sha,
          path: destination,
          purpose:
            "reference-only; create a separately owned task branch before editing; not a replacement for versioned build dependencies",
        },
        null,
        2,
      ),
    );
  } else
    throw new Error(
      "Usage: repo-context.mjs inspect | read <source-id> <path> [full-sha] | checkout <source-id> [full-sha]",
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
