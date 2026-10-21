#!/usr/bin/env node
// Stable .beads/issues.jsonl layout after a beads export (platform-qsts1).
//
// bd emits memory records in Go-map order, so an otherwise identical export
// reshuffles the tail of the file. Keep issue lines in their existing order
// and sort memory lines by key so git diffs stay about tracker content.

import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2] ?? ".beads/issues.jsonl";
const raw = readFileSync(file, "utf8");
const lines = raw.split(/\n/).filter((line) => line.trim() !== "");
const issues = [];
const memories = [];

for (const line of lines) {
  let type = null;
  try {
    type = JSON.parse(line)._type;
  } catch {
    type = null;
  }
  if (type === "memory") memories.push(line);
  else issues.push(line);
}

memories.sort((left, right) => {
  const leftKey = JSON.parse(left).key ?? "";
  const rightKey = JSON.parse(right).key ?? "";
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
});

const next = `${[...issues, ...memories].join("\n")}\n`;
if (next !== raw) writeFileSync(file, next);
