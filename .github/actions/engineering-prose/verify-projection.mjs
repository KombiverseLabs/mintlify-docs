import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root = new URL('./', import.meta.url);
const source = JSON.parse(readFileSync(new URL('source.json', root), 'utf8'));
if (source.repository !== 'KombiverseLabs/kombify-workspace' || source.state !== 'merged-source' ||
    !/^[a-f0-9]{40}$/.test(source.source_commit ?? '') || source.unpublished_parent !== null) {
  throw new Error('The prose runner must be projected from its merged Workspace source; review candidates cannot execute in callers.');
}
for (const file of ['runner.mjs', 'engineering-source-audit.mjs', 'policy.json', 'verify-projection.mjs']) {
  const digest = `sha256:${createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex')}`;
  if (source.outputs?.[file] !== digest) throw new Error(`Projected prose source changed: ${file}`);
}
console.log(`Changed engineering prose: Workspace source ${source.source_commit}; projected bytes verified.`);
