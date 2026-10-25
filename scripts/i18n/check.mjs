#!/usr/bin/env node
// Verifies a translated locale against the English source pages.
//
//   node scripts/i18n/check.mjs de                 check every English page
//   node scripts/i18n/check.mjs de path/a path/b   check only the given page paths (no .mdx)
//
// Checks existing translations for safe frontmatter and resolved internal links.
// Translations may use different prose, examples and components.
// Exit code 1 on any finding.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const code = process.argv[2];
if (!code) {
  console.error("usage: check.mjs <locale> [page paths]");
  process.exit(2);
}
// A missing counterpart is pending translation, not a publication failure.
const only = process.argv.slice(3);
const unknownOption = [code, ...only].find((arg) => arg.startsWith("-"));
if (unknownOption) {
  console.error(`unsupported option ${unknownOption}; usage: check.mjs <locale> [page paths]`);
  process.exit(2);
}
if (process.env.I18N_STRICT !== undefined) {
  console.error("I18N_STRICT is obsolete and ignored; missing translations are reported as pending.");
}
const pending = [];
const skipDirs = new Set([".git", ".github", "node_modules", "openwiki", "standards", "data", "docs-guidelines", "scripts", ".beads", ".kombify", ".mintlify"]);
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
const fmValue = (fm, k) => fm.match(new RegExp(`^${k}:\s*(.*)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "");
const stripCode = (body) => body.replace(/^([ \t]*)(`{3,})[^\n]*\n[\s\S]*?\n\1\2[ \t]*$/gm, "").replace(/`[^`\n]*`/g, "");
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
  if (!isPage(dePath)) { pending.push(page); continue; }
  const en = split(enSrc), de = split(read(dePath));
  if (!en || !de) { add(page, "frontmatter missing or malformed"); continue; }
  for (const k of GENERATED_KEYS) if (fmValue(de.fm, k) !== undefined) add(page, `frontmatter ${k} must not be copied to a translation`);
  for (const k of ["mode", "hidden", "public"]) if (fmValue(en.fm, k) !== fmValue(de.fm, k)) add(page, `frontmatter ${k} changed`);
  for (const k of ["title", "description"]) if (!fmValue(de.fm, k)) add(page, `frontmatter ${k} empty`);
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

console.log(`locale=${code} pages_checked=${pages.length} pending_translation=${pending.length} internal_links_checked=${linkCount} problems=${problems.length}`);
for (const p of problems) console.log(" - " + p);
process.exit(problems.length ? 1 : 0);
