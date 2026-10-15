#!/usr/bin/env node
// Exports the prose of docs pages as a flat JSON catalog for the workspace
// localization producer (one catalog file per locale, keys identical across locales).
//
//   node scripts/i18n/export-catalog.mjs <locale> <out.json> <page> [<page>...]
//
// <page> is an English page path without extension (for example apps/cloud/overview).
// For en the source is <page>.mdx, or <page>.mdx.draft while a page is staged under
// drafts/. For another locale it is <locale>/<page>.mdx. Keys are
// "<page>#fm.<key>" for title/description/sidebarTitle and "<page>#bNNN" for each
// prose block (blank-line separated, fenced code and bare JSX tag lines skipped).
// Markup, links and backticks inside a block stay unchanged so the producer can
// compare placeholders between English and the target language.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [locale, out, ...pages] = process.argv.slice(2);
if (!locale || !out || !pages.length) {
  console.error("usage: export-catalog.mjs <locale> <out.json> <page> [<page>...]");
  process.exit(2);
}

function source(page) {
  const candidates = locale === "en"
    ? [`${page}.mdx`, `drafts/${page}.mdx.draft`]
    : [`${locale}/${page}.mdx`, `drafts/${locale}/${page}.mdx.draft`];
  const found = candidates.find((c) => existsSync(join(root, c)));
  if (!found) throw new Error(`no source for ${locale}/${page} (tried ${candidates.join(", ")})`);
  return readFileSync(join(root, found), "utf8").replace(/\r\n/g, "\n");
}

const catalog = {};
for (const page of pages) {
  const m = source(page).match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${page}: frontmatter missing`);
  for (const key of ["title", "description", "sidebarTitle"]) {
    const v = m[1].match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "");
    if (v) catalog[`${page}#fm.${key}`] = v;
  }
  const body = m[2].replace(/^([ \t]*)(`{3,})[^\n]*\n[\s\S]*?\n\1\2[ \t]*$/gm, "");
  let n = 0;
  for (const raw of body.split(/\n{2,}/)) {
    const text = raw.split("\n").filter((l) => !/^\s*<\/?[A-Z][A-Za-z0-9]*(\s[^>]*)?\/?>\s*$/.test(l)).join("\n").trim();
    if (!text || text.startsWith("import ")) continue;
    catalog[`${page}#b${String(++n).padStart(3, "0")}`] = text;
  }
}
writeFileSync(join(root, out), JSON.stringify(catalog, null, 2) + "\n");
console.log(`locale=${locale} keys=${Object.keys(catalog).length} -> ${out}`);
