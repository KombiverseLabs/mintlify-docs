#!/usr/bin/env node
// Projects the public SpeechKit release into the docs without pinning any
// download URL to a version.
//
// The SpeechKit pages link `releases/latest/...`, which never goes stale. The
// only version-bearing text is one generated line per page, delimited by
// `speechkit-release:begin` / `:end` markers. That line is plain text on
// purpose: an MDX expression would be invisible to crawlers and to offline
// exports, which is exactly the audience that needs to read which release the
// page describes.
//
// Two modes, both deliberately network-free:
//   --release-json <file> --write   rewrite data/speechkit/latest.json and the
//                                   generated blocks from a release payload
//   --check                         assert the committed blocks match the
//                                   committed snapshot (the local docs gate)
//
// Fetching the release payload belongs to the workflow, not to this script, so
// the gate stays deterministic offline.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_PATH = path.join("data", "speechkit", "latest.json");
const SPEECHKIT_DIR = "speechkit";
const SCHEMA_VERSION = "speechkit-docs-snapshot/v1";
const GENERATED_BY = "sync-speechkit-release-docs";
const PUBLIC_REPO = "kombifyio/SpeechKit";

const BEGIN_MARKER = "{/* speechkit-release:begin */}";
const END_MARKER = "{/* speechkit-release:end */}";

// A release that dropped one of these would change what the pages promise, so
// the sync fails closed instead of publishing a version line for it.
export const REQUIRED_ASSETS = [
  "SHA256SUMS.txt",
  "SpeechKit-Portable.zip",
  "SpeechKit-Setup.exe",
  "SpeechKit-macOS-arm64.zip",
  "UNSIGNED-MACOS-RELEASE.txt",
  "UNSIGNED-WINDOWS-RELEASE.txt",
];

const TAG_PATTERN = /^v\d+\.\d+\.\d+$/;

export function releaseUrl(tag) {
  return `https://github.com/${PUBLIC_REPO}/releases/tag/${tag}`;
}

export function renderReleaseLine(snapshot) {
  return `The current public release is [${snapshot.tag}](${releaseUrl(snapshot.tag)}), published ${snapshot.publishedAt}.`;
}

export function buildSnapshot(release, now = new Date()) {
  const tag = String(release?.tag_name ?? "").trim();
  if (!TAG_PATTERN.test(tag)) {
    throw new Error(`release tag_name must be vMAJOR.MINOR.PATCH, got ${JSON.stringify(release?.tag_name)}`);
  }
  if (release.draft === true) {
    throw new Error(`${tag} is a draft release`);
  }
  if (release.prerelease === true) {
    throw new Error(`${tag} is a prerelease`);
  }
  const publishedAt = String(release?.published_at ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(publishedAt)) {
    throw new Error(`release published_at must be an ISO timestamp, got ${JSON.stringify(release?.published_at)}`);
  }
  const assets = (release.assets ?? []).map((asset) => String(asset?.name ?? "")).sort();
  const missing = REQUIRED_ASSETS.filter((name) => !assets.includes(name));
  if (missing.length > 0) {
    throw new Error(`${tag} is missing required published assets: ${missing.join(", ")}`);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    tag,
    publishedAt: publishedAt.slice(0, 10),
    releaseUrl: releaseUrl(tag),
    assets,
    generatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    generatedBy: GENERATED_BY,
  };
}

export function replaceGeneratedBlock(source, line, relativePath) {
  const begin = source.indexOf(BEGIN_MARKER);
  const end = source.indexOf(END_MARKER);
  if (begin < 0 || end < 0) {
    throw new Error(`${relativePath} has no speechkit-release generated block`);
  }
  if (end < begin) {
    throw new Error(`${relativePath} has its speechkit-release markers in the wrong order`);
  }
  const head = source.slice(0, begin + BEGIN_MARKER.length);
  const tail = source.slice(end);
  return `${head}\n${line}\n${tail}`;
}

export function readGeneratedBlock(source, relativePath) {
  const begin = source.indexOf(BEGIN_MARKER);
  const end = source.indexOf(END_MARKER);
  if (begin < 0 || end < 0) {
    throw new Error(`${relativePath} has no speechkit-release generated block`);
  }
  return source.slice(begin + BEGIN_MARKER.length, end).trim();
}

function generatedPages(repoRoot) {
  const dir = path.join(repoRoot, SPEECHKIT_DIR);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".mdx"))
    .sort()
    .map((name) => `${SPEECHKIT_DIR}/${name}`)
    .filter((relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8").includes(BEGIN_MARKER));
}

function readSnapshot(repoRoot) {
  const snapshot = JSON.parse(readFileSync(path.join(repoRoot, SNAPSHOT_PATH), "utf8"));
  if (snapshot.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`${SNAPSHOT_PATH} has unexpected schemaVersion ${snapshot.schemaVersion}`);
  }
  if (!TAG_PATTERN.test(String(snapshot.tag ?? ""))) {
    throw new Error(`${SNAPSHOT_PATH} has an unusable tag ${JSON.stringify(snapshot.tag)}`);
  }
  if (snapshot.releaseUrl !== releaseUrl(snapshot.tag)) {
    throw new Error(`${SNAPSHOT_PATH} releaseUrl does not match its tag`);
  }
  const missing = REQUIRED_ASSETS.filter((name) => !(snapshot.assets ?? []).includes(name));
  if (missing.length > 0) {
    throw new Error(`${SNAPSHOT_PATH} is missing required assets: ${missing.join(", ")}`);
  }
  return snapshot;
}

function write(repoRoot, releaseJsonPath) {
  const release = JSON.parse(readFileSync(releaseJsonPath, "utf8"));
  const snapshot = buildSnapshot(release);
  const line = renderReleaseLine(snapshot);

  mkdirSync(path.join(repoRoot, path.dirname(SNAPSHOT_PATH)), { recursive: true });
  writeFileSync(path.join(repoRoot, SNAPSHOT_PATH), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const pages = generatedPages(repoRoot);
  if (pages.length === 0) {
    throw new Error("no SpeechKit page carries a speechkit-release generated block");
  }
  for (const relativePath of pages) {
    const absolute = path.join(repoRoot, relativePath);
    const source = readFileSync(absolute, "utf8");
    writeFileSync(absolute, replaceGeneratedBlock(source, line, relativePath), "utf8");
  }
  process.stdout.write(`speechkit_docs_sync_tag: ${snapshot.tag}\n`);
  process.stdout.write(`speechkit_docs_sync_pages: ${pages.length}\n`);
  process.stdout.write("speechkit_docs_sync: ok\n");
}

function check(repoRoot) {
  const snapshot = readSnapshot(repoRoot);
  const line = renderReleaseLine(snapshot);
  const pages = generatedPages(repoRoot);
  if (pages.length === 0) {
    throw new Error("no SpeechKit page carries a speechkit-release generated block");
  }
  const drifted = pages.filter(
    (relativePath) => readGeneratedBlock(readFileSync(path.join(repoRoot, relativePath), "utf8"), relativePath) !== line,
  );
  if (drifted.length > 0) {
    throw new Error(
      `generated SpeechKit release block is stale in: ${drifted.join(", ")}. Re-run the sync with --write.`,
    );
  }
  process.stdout.write(`speechkit_release: ${snapshot.tag}\n`);
  process.stdout.write(`speechkit_release_blocks_checked: ${pages.length}\n`);
  process.stdout.write("speechkit_release_blocks: ok\n");
}

function main(argv) {
  const args = argv.slice(2);
  const repoRootIndex = args.indexOf("--repo-root");
  const repoRoot = repoRootIndex >= 0 ? path.resolve(args[repoRootIndex + 1]) : REPO_ROOT;

  if (args.includes("--check")) {
    check(repoRoot);
    return;
  }

  const releaseIndex = args.indexOf("--release-json");
  if (releaseIndex < 0 || !args[releaseIndex + 1]) {
    throw new Error("usage: sync-speechkit-release-docs.mjs (--check | --release-json <file> --write)");
  }
  if (!args.includes("--write")) {
    throw new Error("--release-json requires --write; use --check to validate the committed state");
  }
  write(repoRoot, path.resolve(args[releaseIndex + 1]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv);
  } catch (error) {
    process.stderr.write(`sync-speechkit-release-docs: ${error.message}\n`);
    process.exit(1);
  }
}
