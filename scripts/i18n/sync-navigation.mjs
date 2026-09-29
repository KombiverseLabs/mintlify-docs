#!/usr/bin/env node
// Rebuilds the non-English language branches of docs.json from the English
// tree, so every locale keeps the same structure. English paths never change.
//
//   node scripts/i18n/sync-navigation.mjs            sync every configured locale
//   node scripts/i18n/sync-navigation.mjs de         sync one locale
//
// A locale is configured by scripts/i18n/labels/<code>.json (translated tab and
// group names, keyed by the English name) and an entry in LOCALES below.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const docsPath = join(root, "docs.json");

// code = Mintlify language code = folder prefix = URL prefix.
export const LOCALES = {
  de: { language: "de" },
  es: { language: "es" },
  "zh-Hans": { language: "zh-Hans" },
  hi: { language: "hi" },
  ar: { language: "ar" },
};

function localize(node, code, labels) {
  if (Array.isArray(node)) return node.map((n) => localize(n, code, labels));
  if (typeof node === "string") return `${code}/${node}`;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if ((key === "tab" || key === "group") && typeof value === "string") {
      out[key] = labels[value] ?? value;
    } else if (key === "root" && typeof value === "string") {
      out[key] = `${code}/${value}`;
    } else if (key === "pages" || key === "groups" || key === "tabs") {
      out[key] = localize(value, code, labels);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function sync(docs, codes) {
  const nav = docs.navigation;
  if (!nav.languages) throw new Error("docs.json has no navigation.languages; run the initial migration first");
  const en = nav.languages.find((l) => l.language === "en");
  if (!en) throw new Error("navigation.languages has no en branch");
  const branches = nav.languages.filter((l) => l.language === "en");
  for (const code of codes) {
    const cfg = LOCALES[code];
    if (!cfg) throw new Error(`locale ${code} is not configured in LOCALES`);
    const labelPath = join(root, "scripts", "i18n", "labels", `${code}.json`);
    const labels = existsSync(labelPath) ? JSON.parse(readFileSync(labelPath, "utf8")) : {};
    const { language: _l, default: _d, ...rest } = en;
    branches.push({ language: cfg.language, ...localize(rest, code, labels) });
  }
  nav.languages = branches;
  return docs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const docs = JSON.parse(readFileSync(docsPath, "utf8"));
  const requested = process.argv.slice(2);
  const codes = requested.length ? requested : Object.keys(LOCALES);
  writeFileSync(docsPath, JSON.stringify(sync(docs, codes), null, 2) + "\n");
  console.log(`synced ${codes.join(", ")}`);
}
