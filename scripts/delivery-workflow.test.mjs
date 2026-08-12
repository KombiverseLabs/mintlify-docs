import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const delivery = read(".github/workflows/delivery.yml");
const postLocal = read(".github/workflows/post-local.yml");
const miseUpdate = read(".github/workflows/mise-toolchain-update.yml");
const dependabotMerge = read(".github/workflows/dependabot-auto-merge.yml");
const operations = JSON.parse(read(".kombify/delivery-operations.json"));

test("all workflow action references are immutable", () => {
  for (const workflow of [
    delivery,
    postLocal,
    miseUpdate,
    dependabotMerge,
    read(".github/workflows/parity-gate.yml"),
    read(".github/workflows/public-safety.yml"),
  ]) {
    for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
      const reference = match[1];
      if (reference.startsWith("./")) continue;
      assert.match(reference, /@[0-9a-f]{40}$/, `mutable action reference: ${reference}`);
    }
  }
});

test("public fleet adapters retain exact central provenance without inaccessible callers", () => {
  for (const workflow of [postLocal, miseUpdate, dependabotMerge]) {
    assert.match(workflow, /KombiverseLabs\/\.github@4312c7250169b242e69ce76a4c7111a3c6c968c6/);
    assert.doesNotMatch(workflow, /uses:\s*KombiverseLabs\/\.github\/\.github\/workflows\//);
  }
  assert.doesNotMatch(postLocal, /mise run (?:ci:fast|check|local:e2e)/);
  assert.match(postLocal, /Report repository lint findings[\s\S]*continue-on-error: true/);
  assert.match(postLocal, /Report repository security findings[\s\S]*continue-on-error: true/);
});

test("same-repository access uses github token and cross-repository writes use the purpose token", () => {
  const workflows = [delivery, postLocal, miseUpdate, dependabotMerge].join("\n");
  assert.doesNotMatch(workflows, /secrets\.GH_PAT/);
  assert.match(delivery, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(delivery, /STANDARDS_TOKEN: \$\{\{ secrets\.REPO_SYNC_PAT \}\}/);
  assert.match(miseUpdate, /GH_TOKEN: \$\{\{ secrets\.REPO_SYNC_PAT \}\}/);
  assert.match(postLocal, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
});

test("custom delivery uses the published immutable workspace compiler and exact PR head", () => {
  assert.match(delivery, /STANDARDS_REF: b57345af8b216bd101325940f223751a2cf0fefb/);
  assert.match(delivery, /SOURCE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.doesNotMatch(delivery, /FAIL_CLOSED_FAST/);
});

test("fast activation evidence is post-live and nonblocking while stable remains fail-closed", () => {
  assert.match(
    delivery,
    /if \[\[ "\$DELIVERY_PROFILE" == "stable-1\.0-plus" \]\]; then[\s\S]*run_operation build[\s\S]*run_operation validate[\s\S]*run_operation publish[\s\S]*run_operation promote[\s\S]*run_operation smoke/,
  );
  assert.match(
    delivery,
    /report_nonblocking_operation publish \|\| true[\s\S]*if report_nonblocking_operation promote; then[\s\S]*report_nonblocking_operation smoke \|\| true[\s\S]*fi[\s\S]*report_nonblocking_operation build \|\| true[\s\S]*report_nonblocking_operation validate \|\| true/,
  );
  assert.match(delivery, /exact live activation is pending\/unverified/);
});

test("delivery operations no longer recurse through a delivery-prefixed task", () => {
  const serialized = JSON.stringify(operations);
  assert.doesNotMatch(serialized, /"task":"delivery:/);
  const group = operations.groups.find((entry) => entry.id === "public-docs");
  assert.equal(group.operations.promote.fast[0].task, "postlive:wait-exact-live");
  assert.equal(group.operations.promote.stable[0].task, "postlive:wait-exact-live");
  assert.deepEqual(group.operations.build.fast[0].assert_files, [
    "docs.json",
    "public-safety-policy.json",
  ]);
  assert.deepEqual(group.operations.validate.fast[0].assert_files, [
    "schemas/public-safety-policy.schema.json",
  ]);
  assert.equal(group.operations.build.stable[0].task, "check");
  assert.equal(group.operations.validate.stable[0].task, "local:e2e");
});

test("fast publication remains an exact local no-provider operation", () => {
  const result = spawnSync(process.execPath, [".kombify/delivery.mjs", "publish"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CANDIDATE_RECEIPT_B64: "",
      DELIVERY_ARTIFACT: "public-docs",
      DELIVERY_PROFILE: "fast-pre-1.0",
      SOURCE_REPOSITORY: "mintlify-docs",
      SOURCE_SHA: "a".repeat(40),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Mintlify's repository integration starts publication/);
});
