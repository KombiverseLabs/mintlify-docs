// Downloads pinned release assets from the vendor's own GitHub releases and
// verifies them against the SHA-256 recorded in the scenario (the digest GitHub
// reports for the asset). Anything else fails; there are no mirrors.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache');

export async function releaseAsset({ repo, tag, asset, sha256 }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`invalid artifact pin for ${repo} ${asset}`);
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, `${repo.replace('/', '__')}__${tag}__${asset}`);
  const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
  if (existsSync(file) && digest(readFileSync(file)) === sha256) return file;
  const url = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset)}`;
  console.log(`downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`download failed: ${url} -> HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const actual = digest(buffer);
  if (actual !== sha256) throw new Error(`checksum mismatch for ${asset}: expected ${sha256}, got ${actual}`);
  writeFileSync(file, buffer);
  return file;
}

export function ensureDir(path) {
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
