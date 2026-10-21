import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { credentialFilePrivate } from './beads-github-auth.mjs';

// The existing CodeIntel App signs an ephemeral file; its private key stays
// outside the collector. Reader exchanges never enter the host writer cache.
export async function appReaderCredential(config, { env = process.env, fetchImpl = fetch } = {}) {
  if (config.base !== 'https://beads-cloudflare.soulcreek.workers.dev') throw new Error('Untrusted App reader origin');
  const file = env.BEADS_CLOUDFLARE_APP_JWT_FILE;
  if (!file || !isAbsolute(file)) throw new Error('App reader credential file is unavailable');
  const metadata = lstatSync(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16_384 ||
      !credentialFilePrivate(file)) throw new Error('App reader credential file is not protected');
  const jwt = readFileSync(file, 'utf8').trim();
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)) throw new Error('App reader credential is malformed');
  const response = await fetchImpl(`${config.base}/auth/github`, {
    method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repository: config.github_repository, tracker: config.tracker, credential_type: 'github-app' }),
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`App reader exchange refused (HTTP ${response.status})`); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Invalid App reader credential response');
  const chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); throw new Error('Invalid App reader credential response'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let issued;
  try { issued = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('Invalid App reader credential response'); }
  const expires = Date.parse(issued.expires_at);
  if (!/^bcf_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/.test(issued.token ?? '') ||
      !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 60 * 60_000) throw new Error('Invalid App reader credential response');
  return { token: issued.token, expires_at: issued.expires_at, appReader: true };
}
