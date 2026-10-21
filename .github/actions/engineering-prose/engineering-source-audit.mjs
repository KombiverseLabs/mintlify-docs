import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_BLOB = 2 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
const allowedReasons = new Set(["locale-fixture", "user-generated", "imported", "quoted", "legal", "proper-name", "source-citation"]);
const binaryAsset = /\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz|7z|exe|dll|so|wasm|mp[34]|wav|ogg|webm|sqlite|db)$/i;
// A bounded lexical policy, not a statistical language classifier. One name,
// overlapping English word or diacritic cannot trigger a finding by itself.
const markers = {
  de: new Set("der die das und ist sind wird werden nicht eine einen einem einer für mit muss müssen kann können diese dieser dieses dies bitte deutsch deutsche hallo welt fuer muessen koennen ueber auch oder wenn aber wurde".split(" ")),
  fr: new Set("les une des est sont dans avec pour doit doivent cette ceci veuillez français".split(" ")),
  es: new Set("los las una está están para debe deben este esto puede pueden español".split(" ")),
};
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const safePath = value => typeof value === "string" && value === value.trim() && value.length > 0 &&
  !/[\x00-\x1f]/.test(value) && !path.posix.isAbsolute(value) && !/^[A-Za-z]:/.test(value) &&
  !value.includes("\\") && value.split("/").every(part => part && part !== "." && part !== "..");

function git(root, args, input) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  env.GIT_NO_REPLACE_OBJECTS = "1";
  return execFileSync("git", ["--no-replace-objects", "-C", root, ...args], {
    env, input, timeout: 30_000, maxBuffer: 20 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
}

function jsonValueRanges(text) {
  JSON.parse(text); // Catalog comments or mixed payloads are not blanket-exempt.
  const ranges = [];
  const strings = /"(?:[^"\\]|\\.)*"/g;
  for (const match of text.matchAll(strings)) {
    if (text.slice(match.index + match[0].length).trimStart().startsWith(":")) continue;
    const start = Buffer.byteLength(text.slice(0, match.index), "utf8");
    ranges.push([start, start + Buffer.byteLength(match[0], "utf8")]);
  }
  return ranges;
}

export function languageLines(text) {
  const result = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const words = new Set((line.toLowerCase().match(/\p{L}+/gu) ?? []));
    for (const [language, vocabulary] of Object.entries(markers)) {
      const signals = [...words].filter(word => vocabulary.has(word));
      if (signals.length >= 3) result.push({ line: index + 1, language, signal_count: signals.length });
    }
  }
  return result;
}

/** Only supplied owners are opened. The denominator is metadata, not a fetch list. */
export function auditEngineeringSources({ workspaceRoot, engineeringSources = {} }) {
  const findings = [], scans = [], coverage = [];
  let configurationValid = true;
  const add = (code, repo, file = "", detail = "", severity = "P1", extra = {}) => {
    if (severity === "P0") configurationValid = false;
    findings.push({ severity, surface: "engineering", code, repo, path: file, detail, ...extra });
  };
  let rows, policy, authority = null;
  const authoritySha = object(engineeringSources) ? engineeringSources["kombify-workspace"] : null;
  const unavailable = () => ({ kind: "engineering-source-diagnostic", configuration_valid: configurationValid,
    scan_clear: false, coverage_complete: false, authority, coverage: [], scans, findings,
    candidate_binding: { status: "unbound", promotion_clear: false,
      reason: "Raw selectors are diagnostics; the signed release manifest lacks all-active owner revisions." },
    detector: { policy: "distinct-lexical-markers-v1", languages: Object.keys(markers),
      limitation: "Zero detections does not establish universal English or customer translation QA." } });
  if (!object(engineeringSources)) {
    add("engineering-source-selectors-invalid", "", "", "Selectors must be an owner-to-commit map.", "P0");
    return unavailable();
  }
  if (!SHA.test(authoritySha ?? "")) {
    add("engineering-authority-unselected", "kombify-workspace", "", "A selected Workspace commit is required to bind the denominator and exemption/catalog policy.");
    return unavailable();
  }
  try {
    const root = realpathSync(workspaceRoot);
    if (realpathSync(git(root, ["rev-parse", "--show-toplevel"]).toString().trim()) !== root ||
        git(root, ["rev-parse", "--verify", `${authoritySha}^{commit}`]).toString().trim() !== authoritySha) throw Error();
    authority = { source_sha: authoritySha, tree: git(root, ["rev-parse", `${authoritySha}^{tree}`]).toString().trim(), blobs: {} };
    const readPolicy = file => {
      const entry = decoder.decode(git(root, ["ls-tree", "-z", authoritySha, "--", file]));
      const [header, listedPath] = entry.split("\t");
      if (!["100644", "100755"].includes(header?.split(" ")[0]) || listedPath !== `${file}\0`) throw Error();
      const oid = git(root, ["rev-parse", `${authoritySha}:${file}`]).toString().trim();
      if (git(root, ["cat-file", "-t", oid]).toString().trim() !== "blob") throw Error();
      const bytes = git(root, ["cat-file", "blob", oid]);
      authority.blobs[file] = { git_blob: oid, sha256: digest(bytes) };
      return JSON.parse(decoder.decode(bytes));
    };
    rows = readPolicy("internal/standards-enforcement/repo-manifest.json").repos;
    policy = readPolicy("internal/standards-enforcement/localization-surface-manifest.json");
    if (!object(policy)) throw Error();
    if (!Array.isArray(rows) || rows.some(row => !object(row) || typeof row.id !== "string" || !row.id || typeof row.path !== "string" ||
        !["active", "extracting", "retired"].includes(row.lifecycle) || ![undefined, "repository", "subtree", "sibling"].includes(row.kind) ||
        !(row.path === "." || safePath(row.path) || (row.kind === "sibling" && row.path.startsWith("../") && safePath(row.path.slice(3))))) ||
        new Set(rows.map(row => row.id)).size !== rows.length) throw Error();
  } catch {
    add("engineering-source-authority-unavailable", "kombify-workspace", "", "Selected Workspace policy blobs are missing, unreadable or malformed; working policy is never used.");
    return unavailable();
  }
  const byId = new Map(rows.map(row => [row.id, row]));
  const rootOwner = rows.find(row => row.path === "." && row.lifecycle === "active" && row.kind !== "subtree");
  if (rootOwner?.id !== "kombify-workspace") {
    add("engineering-root-owner-invalid", "kombify-workspace", "", "Selected authority must register the canonical active Workspace root.", "P0");
    return unavailable();
  }
  const owners = rows.filter(row => row.lifecycle === "active" && row.kind !== "subtree");
  for (const [id, sha] of Object.entries(engineeringSources)) {
    if (!owners.some(row => row.id === id) || !SHA.test(sha)) add("engineering-source-selector-invalid", id, "", "Unknown/inactive/non-owner ID or invalid full commit SHA.", "P0");
  }
  const engineering = policy.engineering ?? { exemptions: [] };
  const exemptions = object(engineering) ? engineering.exemptions : null;
  if (!object(engineering) || Object.keys(engineering).some(key => key !== "exemptions") || !Array.isArray(exemptions)) {
    add("engineering-exemptions-invalid", "", "", "Only the registered exemptions collection is supported.", "P0");
  }
  const scopes = [];
  for (const entry of Array.isArray(exemptions) ? exemptions : []) {
    const row = byId.get(entry?.repo_id);
    if (!object(entry) || Object.keys(entry).some(key => !["repo_id", "path", "blob_sha256", "reason", "start_byte", "end_byte"].includes(key)) ||
        !row || row.lifecycle !== "active" || !safePath(entry.path) || !DIGEST.test(entry.blob_sha256) || !allowedReasons.has(entry.reason) ||
        !Number.isSafeInteger(entry.start_byte) || !Number.isSafeInteger(entry.end_byte) || entry.start_byte < 0 || entry.end_byte <= entry.start_byte ||
        (row.kind === "subtree" && !rootOwner)) {
      add("engineering-exemption-scope-invalid", entry?.repo_id ?? "", entry?.path ?? "", "Exemption must bind a known owner, exact blob and bounded standard-backed payload range.", "P0");
      continue;
    }
    scopes.push({ ...entry, owner: row.kind === "subtree" ? rootOwner.id : row.id,
      sourcePath: row.kind === "subtree" ? path.posix.join(row.path, entry.path) : entry.path });
  }
  const catalogs = new Map();
  for (const surface of Array.isArray(policy.surfaces) ? policy.surfaces : []) {
    const row = byId.get(surface.repo_id);
    if (!row || row.lifecycle !== "active" || surface.catalog_mode !== "files") continue;
    const owner = row.kind === "subtree" ? rootOwner?.id : row.id;
    for (const file of Object.values(surface.catalogs ?? {})) {
      if (!safePath(file)) { add("engineering-catalog-scope-invalid", row.id, "", "Registered catalog path is unsafe.", "P0"); continue; }
      const sourcePath = row.kind === "subtree" ? path.posix.join(row.path, file) : file;
      catalogs.set(`${owner}\n${sourcePath}`, true);
    }
  }

  for (const owner of owners) {
    const sha = engineeringSources[owner.id];
    const row = { repo: owner.id, source_sha: sha ?? null, status: "uninspected" };
    coverage.push(row);
    if (!sha) { add("engineering-source-unselected", owner.id, "", "No authorized immutable source selector supplied; owner remains required."); continue; }
    if (!SHA.test(sha)) continue;
    const scan = { ...row, tree: null, files: [], violation_count: 0, complete: false };
    scans.push(scan);
    try {
      const root = realpathSync(path.resolve(workspaceRoot, owner.path));
      if (realpathSync(git(root, ["rev-parse", "--show-toplevel"]).toString().trim()) !== root) throw Error();
      if (git(root, ["rev-parse", "--verify", `${sha}^{commit}`]).toString().trim() !== sha) throw Error();
      scan.tree = git(root, ["rev-parse", `${sha}^{tree}`]).toString().trim();
      const entries = decoder.decode(git(root, ["ls-tree", "-r", "-z", "--full-tree", sha])).split("\0").filter(Boolean).map(record => {
        const match = /^(\d+) (\w+) ([0-9a-f]{40})\t(.+)$/.exec(record);
        if (!match) throw Error();
        return { mode: match[1], type: match[2], oid: match[3], file: match[4] };
      });
      let incomplete = false;
      const regular = entries.filter(entry => {
        if (!["100644", "100755"].includes(entry.mode) || entry.type !== "blob") {
          add("engineering-unsupported-git-mode", owner.id, entry.file, "Tracked entry is not a regular blob; no link is followed."); incomplete = true; return false;
        }
        return true;
      });
      const sizes = regular.length ? git(root, ["cat-file", "--batch-check"], regular.map(entry => entry.oid).join("\n") + "\n").toString().trim().split("\n") : [];
      const ready = regular.filter((entry, index) => {
        const match = /^([0-9a-f]{40}) blob (\d+)$/.exec(sizes[index] ?? "");
        if (!match || match[1] !== entry.oid) throw Error();
        entry.size = Number(match[2]);
        if (entry.size > MAX_BLOB) { add("engineering-text-size-uninspected", owner.id, entry.file, "Blob exceeds the bounded 2 MiB text reader."); incomplete = true; return false; }
        return true;
      });
      const seenScopes = new Set();
      for (let start = 0; start < ready.length;) {
        const batch = [];
        let size = 0;
        while (start < ready.length && batch.length < 100 && size + ready[start].size < 10 * 1024 * 1024) { size += ready[start].size; batch.push(ready[start++]); }
        const result = git(root, ["cat-file", "--batch"], batch.map(entry => entry.oid).join("\n") + "\n");
        let cursor = 0;
        for (const entry of batch) {
          const end = result.indexOf(10, cursor);
          if (result.subarray(cursor, end).toString() !== `${entry.oid} blob ${entry.size}`) throw Error();
          const bytes = result.subarray(end + 1, end + 1 + entry.size); cursor = end + 2 + entry.size;
          const blobDigest = digest(bytes);
          let text;
          try { text = decoder.decode(bytes); if (text.includes("\0")) throw Error(); }
          catch {
            if (binaryAsset.test(entry.file)) { scan.files.push({ path: entry.file, git_blob: entry.oid, blob_sha256: blobDigest, classification: "non-prose-binary-asset" }); continue; }
            add("engineering-text-encoding-uninspected", owner.id, entry.file, "Text is not supported UTF-8; no source body is emitted."); incomplete = true; continue;
          }
          const ranges = [];
          if (catalogs.has(`${owner.id}\n${entry.file}`)) {
            try {
              const bom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
              ranges.push(...jsonValueRanges(text).map(([from, to]) => [from + bom, to + bom]));
            }
            catch { add("engineering-catalog-payload-uninspected", owner.id, entry.file, "Only pure JSON catalog string values are automatically exempt; register precise ranges for mixed formats."); incomplete = true; continue; }
          }
          const bound = scopes.filter(scope => scope.owner === owner.id && scope.sourcePath === entry.file);
          for (const scope of bound) {
            seenScopes.add(scope);
            try {
              if (scope.blob_sha256 !== blobDigest || scope.end_byte > bytes.length || (scope.start_byte === 0 && scope.end_byte === bytes.length)) throw Error();
              decoder.decode(bytes.subarray(0, scope.start_byte)); decoder.decode(bytes.subarray(scope.start_byte, scope.end_byte));
              ranges.push([scope.start_byte, scope.end_byte]);
            } catch { add("engineering-exemption-stale-or-ambiguous", owner.id, entry.file, "Exact blob/range binding does not qualify this payload.", "P0"); incomplete = true; }
          }
          const masked = Buffer.from(bytes);
          ranges.sort((a, b) => a[0] - b[0]);
          let rangeEnd = -1, covered = 0;
          for (const [from, to] of ranges) {
            if (from < rangeEnd) { add("engineering-exemption-overlap", owner.id, entry.file, "Payload ranges overlap and cannot be qualified.", "P0"); incomplete = true; }
            covered += Math.max(0, to - Math.max(from, rangeEnd));
            rangeEnd = Math.max(rangeEnd, to);
          }
          if (covered >= bytes.length && bytes.length > 0) {
            add("engineering-exemption-whole-file-union", owner.id, entry.file, "Combined payload ranges cannot exempt the whole engineering file.", "P0"); incomplete = true;
          }
          for (const [from, to] of ranges) for (let index = from; index < to; index++) if (![10, 13].includes(masked[index])) masked[index] = 32;
          const violations = languageLines(masked.toString("utf8"));
          scan.violation_count += violations.length;
          for (const violation of violations) if (findings.length < 500) add("engineering-non-english-policy-markers", owner.id, entry.file, "Multiple distinct non-English lexical markers detected.", "P1", { ...violation, blob_sha256: blobDigest, git_blob: entry.oid });
          scan.files.push({ path: entry.file, git_blob: entry.oid, blob_sha256: blobDigest, classification: "utf8-policy-scanned" });
        }
      }
      for (const scope of scopes.filter(scope => scope.owner === owner.id && !seenScopes.has(scope))) {
        add("engineering-exemption-target-uninspected", owner.id, scope.sourcePath, "Registered scope was not a supported tracked text blob.", "P0"); incomplete = true;
      }
      scan.complete = !incomplete;
      row.status = scan.complete ? "inspected" : "uninspected";
      scan.status = row.status;
      row.tree = scan.tree;
    } catch {
      add("engineering-source-unavailable", owner.id, "", "Selected commit/tree cannot be read from its canonical local Git owner; no fallback is attempted.");
    }
  }
  const complete = configurationValid && owners.length > 0 && coverage.every(row => row.status === "inspected");
  return { kind: "engineering-source-diagnostic", configuration_valid: configurationValid, authority,
    scan_clear: configurationValid && scans.length > 0 && scans.every(scan => scan.complete && scan.violation_count === 0),
    coverage_complete: complete, coverage, scans, findings,
    candidate_binding: { status: "unbound", promotion_clear: false,
      reason: "Raw selectors are diagnostics. The canonical signed release manifest does not bind revisions for all active non-product owners." },
    detector: { policy: "distinct-lexical-markers-v1", languages: Object.keys(markers), minimum_distinct_markers_per_line: 3,
      limitation: "Zero detections is not proof of universal English or customer translation QA. Non-prose assets are classified, not language-verified." } };
}
