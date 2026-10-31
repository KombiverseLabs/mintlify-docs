// Trusted consumer module: never import code or expectations from a candidate.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const DATA_REPOSITORY = "KombiverseLabs/mintlify-docs";
export const SOURCE_REPOSITORY = "KombiverseLabs/kombify-workspace";
export const DATA_TAG = "agents-policy/current";
export const DATA_PATH = "policy-bundle.json";
export const MAX_BYTES = 128 * 1024;
export const INPUT_PATHS = Object.freeze([
  "AGENTS.md",
  "scripts/agent-planning-policy-sync.mjs",
  "scripts/elastic-development-throughput-policy-sync.mjs",
  "scripts/repository-view-lib.mjs",
  "scripts/agents-policy-bundle.mjs",
  "scripts/agents-policy-data.mjs",
  "scripts/agents-policy-check.mjs",
  "scripts/agents-policy-development.mjs",
  "scripts/agents-policy-publish.mjs",
]);
export const MARKERS = Object.freeze({
  planning: [
    "<!-- BEGIN GENERATED: planning-policy kombify-agent-policy-sync -->",
    "<!-- END GENERATED: planning-policy kombify-agent-policy-sync -->",
  ],
  throughput: [
    "<!-- BEGIN GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->",
    "<!-- END GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->",
  ],
});
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const isSha = value => typeof value === "string" && value.length === 40 && /^[a-f0-9]{40}$/.test(value);
export function requireSha(value, label) {
  if (!isSha(value)) throw new Error(`${label} requires an immutable full 40-character SHA`);
  return value;
}
export function decode(bytes) {
  if (bytes.length > MAX_BYTES) throw new Error("Policy data exceeds the bounded size");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function extractBlocks(text) {
  const blocks = {};
  const ranges = [];
  for (const [name, [begin, end]] of Object.entries(MARKERS)) {
    const starts = text.split(begin).length - 1;
    const ends = text.split(end).length - 1;
    const start = text.indexOf(begin);
    const finish = text.indexOf(end);
    if (starts !== 1 || ends !== 1 || finish <= start) throw new Error(`Missing, duplicate or reversed ${name} markers`);
    const stop = finish + end.length;
    if ((start && text[start - 1] !== "\n") || (stop < text.length && text[stop] !== "\n")) {
      throw new Error(`Malformed ${name} marker lines`);
    }
    blocks[name] = text.slice(start, stop);
    ranges.push([start, stop]);
  }
  if (ranges[0][0] < ranges[1][1] && ranges[1][0] < ranges[0][1]) throw new Error("Overlapping policy blocks");
  // Also reject near-miss marker lines for these namespaces, even outside blocks.
  const markerLines = text.split("\n").filter(line => /<!--.*(?:planning-policy|elastic-development-throughput)/.test(line));
  if (markerLines.length !== 4 || markerLines.some(line => !Object.values(MARKERS).flat().includes(line))) {
    throw new Error("Malformed policy markers");
  }
  return blocks;
}

export function parseBundle(bytes) {
  const bundle = JSON.parse(decode(bytes));
  const keys = Object.keys(bundle).sort().join(",");
  if (keys !== "blocks,inputs,outputs_sha256,schema,source" || bundle.schema !== 1 ||
      bundle.source?.repository !== SOURCE_REPOSITORY || !isSha(bundle.source?.sha) ||
      Object.keys(bundle.source).sort().join(",") !== "repository,sha") throw new Error("Invalid policy bundle provenance/schema");
  if (!bundle.inputs || Object.keys(bundle.inputs).sort().join("\n") !== [...INPUT_PATHS].sort().join("\n") ||
      Object.values(bundle.inputs).some(hash => typeof hash !== "string" || hash.length !== 64 || !/^[a-f0-9]{64}$/.test(hash))) throw new Error("Invalid policy input digests");
  if (!bundle.blocks || Object.keys(bundle.blocks).sort().join(",") !== "planning,throughput" ||
      Object.values(bundle.blocks).some(block => typeof block !== "string") ||
      bundle.outputs_sha256 !== sha256(JSON.stringify(bundle.blocks))) throw new Error("Invalid policy output digest");
  const extracted = extractBlocks(`${bundle.blocks.planning}\n${bundle.blocks.throughput}`);
  if (Object.keys(extracted).some(name => extracted[name] !== bundle.blocks[name])) throw new Error("Policy block boundaries do not match their names");
  return bundle;
}

export function git(repo, args, options = {}) {
  return execFileSync("git", ["--no-replace-objects", "-C", repo, ...args], {
    stdio: ["ignore", "pipe", "pipe"], maxBuffer: MAX_BYTES, ...options,
  });
}
export function readCandidate(repo, candidate) {
  requireSha(candidate, "--candidate");
  if (git(repo, ["cat-file", "-t", candidate]).toString().trim() !== "commit") throw new Error("Candidate must be an exact commit");
  const entry = git(repo, ["ls-tree", "-z", candidate, "--", "AGENTS.md"]).toString();
  const match = /^(100644|100755) blob ([a-f0-9]{40})\tAGENTS\.md\0$/.exec(entry);
  if (!match) throw new Error("Candidate AGENTS.md must be a regular Git blob at the repository root");
  return { blob: match[2], text: decode(git(repo, ["cat-file", "blob", match[2]])) };
}
export function compareCandidate(bundle, repo, candidate) {
  const { text, blob } = readCandidate(repo, candidate);
  const actual = extractBlocks(text);
  const drift = Object.keys(MARKERS).filter(name => actual[name] !== bundle.blocks[name]);
  if (drift.length) throw new Error(`Generated AGENTS policy drift: ${drift.join(", ")}; regenerate from merged workspace policy`);
  return { candidate, agents_blob: blob, workspace_sha: bundle.source.sha, outputs_sha256: bundle.outputs_sha256 };
}

// GitHub transport has a fixed origin, bounded response and no redirects/retries.
export async function api(path, { token, method = "GET", body, allowMissing = false } = {}) {
  const response = await fetch(`https://api.github.com/${path}`, {
    method, redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (allowMissing && response.status === 404) { await response.body?.cancel(); return null; }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES * 2) { await response.body.cancel().catch(() => {}); throw new Error("GitHub response exceeds the bounded size"); }
    chunks.push(chunk);
  }
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return JSON.parse(decode(Buffer.concat(chunks)));
}

export async function readDataCommit(commitSha, token) {
  requireSha(commitSha, "Policy data commit");
  const root = `repos/${DATA_REPOSITORY}/git`;
  const commit = await api(`${root}/commits/${commitSha}`, { token });
  if (commit.sha !== commitSha || !Array.isArray(commit.parents) || commit.parents.length !== 0) throw new Error("Policy data must be an orphan commit");
  const tree = await api(`${root}/trees/${requireSha(commit.tree?.sha, "Policy tree")}`, { token });
  if (tree.sha !== commit.tree.sha || tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length !== 1 ||
      tree.tree[0].path !== DATA_PATH || tree.tree[0].mode !== "100644" || tree.tree[0].type !== "blob") throw new Error("Policy commit must contain exactly one regular JSON blob");
  const blobSha = requireSha(tree.tree[0].sha, "Policy blob");
  const blob = await api(`${root}/blobs/${blobSha}`, { token });
  if (blob.sha !== blobSha || blob.encoding !== "base64" || !Number.isSafeInteger(blob.size) || blob.size > MAX_BYTES || typeof blob.content !== "string") throw new Error("Invalid policy Git blob");
  const bytes = Buffer.from(blob.content.replaceAll("\n", ""), "base64");
  if (bytes.length !== blob.size || createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== blobSha) throw new Error("Policy Git blob digest mismatch");
  return { bundle: parseBundle(bytes), bytes };
}
export async function readDataRef(token, allowMissing = false) {
  const ref = await api(`repos/${DATA_REPOSITORY}/git/ref/tags/${DATA_TAG}`, { token, allowMissing });
  if (ref === null) return null;
  if (ref.ref !== `refs/tags/${DATA_TAG}` || ref.object?.type !== "commit") throw new Error("Policy tag must point directly to a data commit");
  return requireSha(ref.object.sha, "Policy tag target");
}

export function parseFlags(args, valueFlags, switches = []) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if ((!valueFlags.includes(flag) && !switches.includes(flag)) || Object.hasOwn(options, flag)) throw new Error(`Unknown or duplicate argument: ${flag}`);
    const value = switches.includes(flag) ? true : args[++index];
    if (!value || (typeof value === "string" && value.startsWith("--"))) throw new Error(`Missing value for ${flag}`);
    options[flag] = value;
  }
  for (const flag of valueFlags) if (!options[flag]) throw new Error(`Required argument: ${flag}`);
  return options;
}
