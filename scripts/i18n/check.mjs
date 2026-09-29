#!/usr/bin/env node
// Verifies a translated locale against the English source pages.
//
//   node scripts/i18n/check.mjs de                 check every English page
//   node scripts/i18n/check.mjs de path/a path/b   check only the given page paths (no .mdx)
//
// Checks per page: counterpart exists, frontmatter keys and non-prose values
// (icon, mode) match, fenced code blocks are byte-identical, the same JSX
// component tags appear, and every internal link resolves (page links must
// point to the locale, asset links stay shared, heading anchors must exist).
// Exit code 1 on any finding.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const code = process.argv[2];
if (!code) {
  console.error("usage: check.mjs <locale> [page paths]");
  process.exit(2);
}
const only = process.argv.slice(3);
const skipDirs = new Set([".git", ".github", "node_modules", "drafts", "openwiki", "standards", "data", "docs-guidelines", "scripts", ".beads", ".kombify", ".mintlify"]);
const locales = new Set(["de", "es", "zh-Hans", "hi", "ar", "cn"]);

function walk(dir, rel = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const full = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) {
      if (!rel && locales.has(name)) continue;
      out.push(...walk(full, r));
    } else if (name.endsWith(".mdx")) out.push(r.slice(0, -4));
  }
  return out;
}

const read = (p) => readFileSync(join(root, p + ".mdx"), "utf8").replace(/\r\n/g, "\n");
const split = (src) => {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : null;
};
// Generator provenance keys describe the English render, not a translation.
const GENERATED_KEYS = new Set(["generated", "generated_by", "content_hash", "source_hash"]);
const fmKeys = (fm) => [...fm.matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]).filter((k) => !GENERATED_KEYS.has(k));
const fmValue = (fm, k) => fm.match(new RegExp(`^${k}:\s*(.*)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "");
const fences = (body) => [...body.matchAll(/^([ \t]*)(`{3,})[^\n]*\n[\s\S]*?\n\1\2[ \t]*$/gm)].map((m) => m[0].split("\n").map((l) => l.trimStart()).join("\n"));
const stripCode = (body) => body.replace(/^([ \t]*)(`{3,})[^\n]*\n[\s\S]*?\n\1\2[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
const tags = (body) => [...stripCode(body).matchAll(/<([A-Z][A-Za-z0-9]*)[\s>/]/g)].map((m) => m[1]).sort().join(",");
const slug = (t) =>
  t.replace(/<[^>]*>/g, "").replace(/[`*_]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
const anchorsOf = (body) => {
  const set = new Set();
  for (const m of stripCode(body).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) set.add(slug(m[1]));
  for (const m of body.matchAll(/\bid=["']([^"']+)["']/g)) set.add(m[1]);
  return set;
};
const linkTargets = (body) => {
  const b = stripCode(body);
  const t = [];
  for (const m of b.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) t.push(m[1]);
  for (const m of b.matchAll(/\bhref=["']([^"']+)["']/g)) t.push(m[1]);
  return t;
};
const external = (t) => /^(https?:|mailto:|tel:|javascript:|\/\/)/i.test(t);
const isPage = (p) => existsSync(join(root, p + ".mdx"));

const pages = (only.length ? only : walk(root)).sort();
const problems = [];
const add = (page, msg) => problems.push(`${code}/${page}: ${msg}`);
let linkCount = 0;

for (const page of pages) {
  const enSrc = read(page);
  const dePath = `${code}/${page}`;
  if (!isPage(dePath)) { add(page, "missing translation"); continue; }
  const en = split(enSrc), de = split(read(dePath));
  if (!en || !de) { add(page, "frontmatter missing or malformed"); continue; }
  for (const k of GENERATED_KEYS) if (fmValue(de.fm, k) !== undefined) add(page, `frontmatter ${k} must not be copied to a translation`);
  if (fmKeys(en.fm).join() !== fmKeys(de.fm).join()) add(page, `frontmatter keys differ (${fmKeys(en.fm)} vs ${fmKeys(de.fm)})`);
  for (const k of ["icon", "mode", "hidden", "public"]) if (fmValue(en.fm, k) !== fmValue(de.fm, k)) add(page, `frontmatter ${k} changed`);
  for (const k of ["title", "description"]) if (!fmValue(de.fm, k)) add(page, `frontmatter ${k} empty`);
  const ef = fences(en.body), df = fences(de.body);
  if (ef.length !== df.length) add(page, `code block count ${ef.length} vs ${df.length}`);
  else ef.forEach((b, i) => { if (b !== df[i]) add(page, `code block #${i + 1} differs`); });
  if (tags(en.body) !== tags(de.body)) add(page, "JSX component tags differ");
  const enImports = enSrc.match(/^import .*$/gm) ?? [];
  const deImports = read(dePath).match(/^import .*$/gm) ?? [];
  if (enImports.length !== deImports.length) add(page, "import count differs");

  const ownAnchors = anchorsOf(de.body);
  for (const target of linkTargets(de.body)) {
    if (external(target)) continue;
    linkCount++;
    const [pathPart, frag] = target.split("#");
    if (!pathPart) { if (frag && !ownAnchors.has(frag)) add(page, `unresolved anchor #${frag}`); continue; }
    const clean = pathPart.split("?")[0];
    if (!clean.startsWith("/")) { add(page, `relative link ${target} (use absolute /${code}/... paths)`); continue; }
    const rel = clean.replace(/^\/+/, "").replace(/\/$/, "");
    if (/\.[a-z0-9]+$/i.test(rel) && !rel.endsWith(".mdx")) {
      if (!existsSync(join(root, rel))) add(page, `missing asset ${target}`);
      continue;
    }
    if (!rel.startsWith(`${code}/`) && rel !== code) { add(page, `link ${target} does not point into /${code}/`); continue; }
    const resolved = rel === code ? `${code}/index` : rel;
    const file = isPage(resolved) ? resolved : isPage(`${resolved}/index`) ? `${resolved}/index` : null;
    if (!file) { add(page, `broken link ${target}`); continue; }
    if (frag && !anchorsOf(split(read(file)).body).has(frag)) add(page, `anchor #${frag} not found in ${file}`);
  }
}

console.log(`locale=${code} pages_checked=${pages.length} internal_links_checked=${linkCount} problems=${problems.length}`);
for (const p of problems) console.log(" - " + p);
process.exit(problems.length ? 1 : 0);
