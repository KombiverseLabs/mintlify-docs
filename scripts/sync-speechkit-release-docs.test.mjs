import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "sync-speechkit-release-docs.mjs");

const PAGE = `---
title: "Example"
---

Intro.

{/* speechkit-release:begin */}
stale line
{/* speechkit-release:end */}

Outro.
`;

function release(overrides = {}) {
  return {
    tag_name: "v1.2.3",
    draft: false,
    prerelease: false,
    published_at: "2026-09-15T18:20:33Z",
    assets: [
      "SHA256SUMS.txt",
      "SpeechKit-Portable.zip",
      "SpeechKit-Setup.exe",
      "SpeechKit-macOS-arm64.zip",
      "UNSIGNED-MACOS-RELEASE.txt",
      "UNSIGNED-WINDOWS-RELEASE.txt",
    ].map((name) => ({ name })),
    ...overrides,
  };
}

function fixture(releasePayload = release()) {
  const root = mkdtempSync(path.join(tmpdir(), "speechkit-docs-sync-"));
  mkdirSync(path.join(root, "speechkit"), { recursive: true });
  writeFileSync(path.join(root, "speechkit", "overview.mdx"), PAGE, "utf8");
  const releasePath = path.join(root, "release.json");
  writeFileSync(releasePath, JSON.stringify(releasePayload), "utf8");
  return { root, releasePath };
}

function run(args) {
  return execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("a synced page names the published release and passes its own check", () => {
  const { root, releasePath } = fixture();

  run(["--repo-root", root, "--release-json", releasePath, "--write"]);

  const page = readFileSync(path.join(root, "speechkit", "overview.mdx"), "utf8");
  assert.match(page, /\[v1\.2\.3\]\(https:\/\/github\.com\/kombifyio\/SpeechKit\/releases\/tag\/v1\.2\.3\), published 2026-09-15\./);
  assert.doesNotMatch(page, /stale line/);
  assert.match(run(["--repo-root", root, "--check"]), /speechkit_release_blocks: ok/);
});

test("re-syncing the release already on record changes no file", () => {
  const { root, releasePath } = fixture();
  run(["--repo-root", root, "--release-json", releasePath, "--write"]);
  const snapshotPath = path.join(root, "data", "speechkit", "latest.json");
  const pagePath = path.join(root, "speechkit", "overview.mdx");
  // An old timestamp on record, so a sync that rewrote it could not pass by
  // happening to run within the same second.
  const recorded = JSON.parse(readFileSync(snapshotPath, "utf8"));
  writeFileSync(snapshotPath, `${JSON.stringify({ ...recorded, generatedAt: "2000-01-01T00:00:00Z" }, null, 2)}\n`, "utf8");
  const before = [readFileSync(snapshotPath, "utf8"), readFileSync(pagePath, "utf8")];

  run(["--repo-root", root, "--release-json", releasePath, "--write"]);

  assert.deepEqual([readFileSync(snapshotPath, "utf8"), readFileSync(pagePath, "utf8")], before);
});

test("a page whose release line drifted from the snapshot fails the check", () => {
  const { root, releasePath } = fixture();
  run(["--repo-root", root, "--release-json", releasePath, "--write"]);

  const pagePath = path.join(root, "speechkit", "overview.mdx");
  writeFileSync(pagePath, readFileSync(pagePath, "utf8").replace("v1.2.3", "v9.9.9"), "utf8");

  assert.throws(
    () => run(["--repo-root", root, "--check"]),
    (error) => /stale/.test(String(error.stderr)),
  );
});

test("a release without the downloads the pages link is refused", () => {
  const { root, releasePath } = fixture(
    release({ assets: [{ name: "SHA256SUMS.txt" }, { name: "SpeechKit-Setup.exe" }] }),
  );

  assert.throws(
    () => run(["--repo-root", root, "--release-json", releasePath, "--write"]),
    (error) => /missing required published assets/.test(String(error.stderr)),
  );
});

test("a draft release never becomes a published version claim", () => {
  const { root, releasePath } = fixture(release({ draft: true }));

  assert.throws(
    () => run(["--repo-root", root, "--release-json", releasePath, "--write"]),
    (error) => /draft/.test(String(error.stderr)),
  );
});
