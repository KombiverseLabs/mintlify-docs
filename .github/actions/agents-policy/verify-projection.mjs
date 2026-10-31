import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const root = new URL("./", import.meta.url);
const source = JSON.parse(readFileSync(new URL("source.json", root), "utf8"));
if (source.repository !== "KombiverseLabs/kombify-workspace" || source.state !== "merged-source" ||
    source.source_commit !== "db397acfc6fb446a45d63804c05360b7431ecdd8" || source.unpublished_parent !== null) {
  throw new Error("AGENTS policy comparator must come from its reviewed merged Workspace source");
}
for (const file of ["agents-policy-check.mjs", "agents-policy-data.mjs", "verify-projection.mjs"]) {
  const digest = `sha256:${createHash("sha256").update(readFileSync(new URL(file, root))).digest("hex")}`;
  if (source.outputs?.[file] !== digest) throw new Error(`Projected AGENTS policy source changed: ${file}`);
  if (file !== "verify-projection.mjs" && source.inputs?.[`scripts/${file}`] !== digest) {
    throw new Error(`AGENTS policy projection differs from its Workspace input: ${file}`);
  }
}
console.log(`AGENTS policy comparator: Workspace source ${source.source_commit}; projected bytes verified.`);
