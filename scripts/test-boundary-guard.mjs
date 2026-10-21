#!/usr/bin/env node
// Copy of KombiverseLabs/.github .github/actions/test-boundary-guard/guard.mjs at
// 6afc2332e43eccc2eb4293cc2857ff3b0c6aa73a. This public repository cannot use the organization's
// internal action, so its trusted required workflow runs this copy from the
// producer checkout. Keep it byte-identical below this header.
// Test boundary guard: a change must not grow the unit tests outside the
// repository's declared sensitive boundaries. End-to-end journeys with the
// shared test users are the standard proof of behavior (kombify workspace
// DEVELOPMENT-THROUGHPUT-STANDARD.md "Testing", decision D-2026-10-20-04).
//
// The boundary declaration is read from the base revision, so widening it is
// its own pull request. Moving, editing, consolidating and deleting tests pass;
// only a net growth of guarded test cases fails.
//
// Usage (inside the repository):
//   node guard.mjs --base <rev> --head <rev>   compare two revisions (CI)
//   node guard.mjs [--base origin/main]        compare the working tree with the merge base
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const DECLARATION = ".kombify/test-boundaries.json";
const SCHEMA = "kombify.test-boundaries.v1";
const CATEGORIES = new Set(["auth", "billing", "crypto", "migration", "compiler"]);
const MAX_BYTES = 2 * 1024 * 1024;

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const repo = path.resolve(option("--repo") ?? ".");
const git = (...argv) =>
  execFileSync("git", ["-C", repo, ...argv], { encoding: "utf8", maxBuffer: 1 << 28 });
const show = (rev, file) => {
  try {
    return execFileSync("git", ["-C", repo, "show", `${rev}:${file}`], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

const head = option("--head");
let base = option("--base");
if (!base && head) fail("--base is required with --head");
if (!base) {
  try {
    base = git("merge-base", "HEAD", "origin/main").trim();
  } catch {
    fail("no --base given and no merge base with origin/main");
  }
}

// Paths that are never this repository's own tests.
const EXCLUDED = /(^|\/)(node_modules|vendor|third_party|dist|build|\.svelte-kit|target)\//;

export function language(file) {
  if (EXCLUDED.test(file) || /\.d\.ts$/.test(file)) return null;
  if (/_test\.go$/.test(file)) return "go";
  if (/\.(test|spec)\.(m|c)?[jt]sx?$/.test(file) || /(^|\/)__tests__\/.+\.(m|c)?[jt]sx?$/.test(file)) return "js";
  if (/(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(file)) return "python";
  if (/\/(test|androidTest|jvmTest|commonTest|unitTest)\/.+\.(kt|java)$/.test(file)) return "kotlin";
  if (/(^|\/)[^/]*Tests?\/.+\.swift$/.test(file)) return "swift";
  if (/\.rs$/.test(file)) return "rust";
  if (/(^|\/)test\/.+\.(c|cpp)$/.test(file)) return "c";
  if (/\.bats$/.test(file)) return "bats";
  return null;
}

const JS_CASE =
  /(^|[^\w.$])(it|test)(\.(only|skip|concurrent|fails|todo|fixme|slow|sequential|effect|scoped|live|layer|scopedLive|prop|flakyTest|runIf\([^)]*\)|skipIf\([^)]*\)))*(\.each\s*(\([^)]*\)|`[^`]*`))?\s*\(/gm;

// Declared test cases; table rows and `.each` rows count once.
export function cases(lang, source) {
  const count = (pattern) => (source.match(pattern) ?? []).length;
  switch (lang) {
    case "go": return count(/^func (Test(?!Main\b)\w*|Fuzz\w*)\(/gm);
    case "js": return count(JS_CASE);
    case "python": return count(/^\s*(async\s+)?def test_?\w*\(/gm);
    case "kotlin": return count(/@Test\b/g);
    case "swift": return count(/func test\w*\(|@Test\b/g);
    case "rust": return count(/#\[(tokio::)?test\]/g);
    case "c": return count(/RUN_TEST\(/g);
    case "bats": return count(/^@test /gm);
    default: return 0;
  }
}

export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else if (char === "{") {
      const close = glob.indexOf("}", i);
      out += `(?:${glob.slice(i + 1, close).split(",").map((part) => part.replace(/[.+^$()|[\]\\]/g, "\\$&")).join("|")})`;
      i = close;
    } else out += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

const matcher = (globs = []) => {
  const patterns = globs.map(globToRegExp);
  return (file) => patterns.some((pattern) => pattern.test(file));
};

function fail(message) {
  console.error(`::error::Test boundary guard: ${message}`);
  process.exit(1);
}

export function parseDeclaration(text) {
  if (text === null) {
    return { boundaries: [], e2e: matcher(), inherited: { paths: matcher(), except: matcher() }, declared: false };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${DECLARATION} is not valid JSON: ${error.message}`);
  }
  const errors = [];
  const allowed = new Set(["$schema", "schema", "boundaries", "e2e", "inherited"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`unknown key ${key}`);
  if (value.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  const globs = (list, label) => {
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.some((item) => typeof item !== "string" || !item || item.startsWith("/"))) {
      errors.push(`${label} must be a list of repository-relative globs`);
      return [];
    }
    return list;
  };
  const boundaries = (value.boundaries ?? []).map((entry, index) => {
    const label = `boundaries[${index}]`;
    if (!CATEGORIES.has(entry?.category)) errors.push(`${label}.category must be one of ${[...CATEGORIES].join(", ")}`);
    if (typeof entry?.reason !== "string" || entry.reason.trim().length < 10) errors.push(`${label}.reason must name the production code`);
    const paths = globs(entry?.paths, `${label}.paths`);
    if (!paths.length) errors.push(`${label}.paths must not be empty`);
    return { category: entry?.category, paths, match: matcher(paths) };
  });
  const e2e = globs(value.e2e, "e2e");
  const inherited = value.inherited ?? {};
  const inheritedPaths = globs(inherited.paths, "inherited.paths");
  const inheritedExcept = globs(inherited.except, "inherited.except");
  if (inheritedPaths.length && typeof inherited.upstream !== "string") errors.push("inherited.upstream must name the upstream repository");
  if (errors.length) throw new Error(`${DECLARATION} at the base revision is invalid: ${errors.join("; ")}`);
  return {
    boundaries,
    e2e: matcher(e2e),
    inherited: { paths: matcher(inheritedPaths), except: matcher(inheritedExcept) },
    declared: true,
  };
}

// One version of a test file: inherited, e2e, boundary:<category> or guarded.
// End-to-end paths come only from the base declaration, never from file content,
// so a comment or a build tag cannot exempt a unit test.
export function classify(file, source, lang, declaration) {
  const { inherited } = declaration;
  if (inherited.paths(file) && !inherited.except(file)) return "inherited";
  const mocked = lang === "js" && /\.fulfill\s*\(/.test(source);
  if (!mocked && declaration.e2e(file)) return "e2e";
  const boundary = declaration.boundaries.find((entry) => entry.match(file));
  return boundary ? `boundary:${boundary.category}` : "guarded";
}

function changedFiles() {
  const diff = head
    ? git("diff", "--name-status", "--no-renames", "-z", base, head)
    : git("diff", "--name-status", "--no-renames", "-z", base);
  const parts = diff.split("\0").filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length; i += 2) files.push({ status: parts[i][0], file: parts[i + 1] });
  if (!head) {
    for (const file of git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)) {
      files.push({ status: "A", file });
    }
  }
  return files;
}

function readHead(file) {
  if (head) return show(head, file);
  const absolute = path.join(repo, file);
  if (!existsSync(absolute)) return null;
  return readFileSync(absolute, "utf8");
}

function main() {
  let declaration;
  try {
    declaration = parseDeclaration(show(base, DECLARATION));
  } catch (error) {
    fail(error.message);
  }
  let guardedDelta = 0;
  const grown = [];
  const allowed = [];
  for (const { status, file } of changedFiles()) {
    const lang = language(file);
    if (!lang) continue;
    const before = status === "A" ? null : show(base, file);
    const after = status === "D" ? null : readHead(file);
    // A version the diff says exists but cannot be read fails closed, and so does
    // an oversized test file, so padding cannot hide test cases.
    if (status !== "A" && before === null) fail(`cannot read ${file} at the base revision`);
    if (status !== "D" && after === null) fail(`cannot read ${file} at the head revision`);
    const version = (source) => {
      if (source === null) return { kind: "none", count: 0 };
      if (source.length > MAX_BYTES) fail(`${file} is larger than ${MAX_BYTES} bytes; split the test file`);
      return { kind: classify(file, source, lang, declaration), count: cases(lang, source) };
    };
    const was = version(before);
    const now = version(after);
    const guardedBefore = was.kind === "guarded" ? was.count : 0;
    const guardedAfter = now.kind === "guarded" ? now.count : 0;
    guardedDelta += guardedAfter - guardedBefore;
    if (guardedAfter > guardedBefore) grown.push(`${file} (+${guardedAfter - guardedBefore})`);
    if (now.kind !== "guarded" && now.kind !== "none" && now.count > (was.kind === now.kind ? was.count : 0)) {
      allowed.push(`${file}: ${now.kind}`);
    }
  }

  const lines = [
    `Base ${base}${head ? `, head ${head}` : ", working tree"}; declaration ${declaration.declared ? DECLARATION : "absent (no boundaries declared)"}.`,
    `Unit test cases outside the declared boundaries: ${guardedDelta >= 0 ? "+" : ""}${guardedDelta}.`,
    ...(allowed.length ? ["Allowed growth (end-to-end, boundary or inherited):", ...allowed.map((item) => `  ${item}`)] : []),
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Test boundary guard\n\n${lines.map((line) => line.trim() ? `- ${line.trim()}` : "").join("\n")}\n`);
  }
  if (guardedDelta > 0) {
    console.log(["Files that add unit test cases outside the declared boundaries:", ...grown.map((item) => `  ${item}`)].join("\n"));
    fail(
      `this change adds ${guardedDelta} unit test case(s) outside the declared sensitive boundaries. ` +
        "Prove the behavior with an end-to-end journey against the running product signed in as the shared test users instead " +
        '(kombify workspace DEVELOPMENT-THROUGHPUT-STANDARD.md "Testing", D-2026-10-20-04). ' +
        `If the code under test is a sensitive boundary (${[...CATEGORIES].join(", ")}), declare its paths in ${DECLARATION} in a separate pull request first.`,
    );
  }
}

try {
  main();
} catch (error) {
  fail(String(error.message ?? error).split("\n")[0]);
}
