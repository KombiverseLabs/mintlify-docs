import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { credentialFilePrivate, githubOidcUrl } from './beads-github-auth.mjs';

/** Explicit reader selection never falls back to a writer identity or cache. */
export function trackerReaderMode(env = process.env) {
  const mode = env.BEADS_CLOUDFLARE_ADMISSION_READER;
  if (mode && (mode !== 'github-portfolio-reader' || env.BEADS_CLOUDFLARE_APP_JWT_FILE)) throw new Error('Ambiguous tracker reader identity');
  return mode ? 'admission-reader' : env.BEADS_CLOUDFLARE_APP_JWT_FILE ? 'app-reader' : null;
}

/** Existing OIDC reader exchange, selected only by the immutable AI admission workflow. */
export async function admissionReaderCredential(config, { env = process.env, fetchImpl = fetch } = {}) {
  try {
  if (trackerReaderMode(env) !== 'admission-reader' || config.base !== 'https://beads-cloudflare.soulcreek.workers.dev' ||
      config.github_repository !== 'KombiverseLabs/kombify-workspace' || config.tracker !== 'kombify-workspace' ||
      env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'KombiverseLabs/kombify-AI-Platform' ||
      env.GITHUB_REPOSITORY_ID !== '1262885859' || env.GITHUB_REPOSITORY_OWNER_ID !== '249091777' ||
      env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_RUN_ATTEMPT !== '1' ||
      env.GITHUB_WORKFLOW_REF !== 'KombiverseLabs/kombify-AI-Platform/.github/workflows/delivery.yml@refs/heads/main' ||
      !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '') || env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA ||
      !env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error('Admission reader identity is unavailable');
  const url = githubOidcUrl(env.ACTIONS_ID_TOKEN_REQUEST_URL, config.base);
  const identityResponse = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!identityResponse.ok) { await identityResponse.body?.cancel(); throw new Error('Admission reader identity request refused'); }
  const identity = await boundedCredentialJson(identityResponse, 16_384);
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(identity.value ?? '')) throw new Error('Admission reader identity is malformed');
  const response = await fetchImpl(`${config.base}/auth/github`, {
    method: 'POST', headers: { Authorization: `Bearer ${identity.value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repository: config.github_repository, tracker: config.tracker,
      credential_type: 'github-portfolio-reader', reader: env.GITHUB_REPOSITORY }),
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  return { ...(await issuedReaderCredential(response)), admissionReader: true };
  } catch {
    throw Object.assign(new Error('Read-only admission identity unavailable'), { code: 'ADMISSION_READER_UNAVAILABLE' });
  }
}

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
  return { ...(await issuedReaderCredential(response)), appReader: true };
}

async function boundedCredentialJson(response, limit = 4096) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Invalid App reader credential response');
  const chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new Error('Invalid App reader credential response'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('Invalid App reader credential response'); }
}

async function issuedReaderCredential(response) {
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Tracker reader exchange refused (HTTP ${response.status})`); }
  const issued = await boundedCredentialJson(response);
  const expires = Date.parse(issued.expires_at);
  if (!/^bcf_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/.test(issued.token ?? '') ||
      !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 60 * 60_000) throw new Error('Invalid App reader credential response');
  return { token: issued.token, expires_at: issued.expires_at };
}

/** Fresh private identity for one read-only native admission phase; never a writer cache. */
export async function prepareAppReaderFile({ directory, runId, attempt, phase, privateKey }) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || /[\r\n]/u.test(directory) ||
      !/^[1-9][0-9]*$/u.test(runId ?? '') || !/^[1-9][0-9]*$/u.test(attempt ?? '') ||
      !['bootstrap', 'inventory', 'prepare'].includes(phase) || typeof privateKey !== 'string' || !privateKey) {
    throw new Error('App reader custody is unavailable');
  }
  // Projected access clients need no signer unless this explicit native purpose is selected.
  const { appJwt } = await import('../github-app-token.mjs');
  const jwt = appJwt('4862598', privateKey);
  const file = join(directory, 'window-tracker-reader-' + runId + '-' + attempt + '-' + phase + '.jwt');
  const fd = openSync(file, 'wx', 0o600);
  try { writeFileSync(fd, jwt); fsyncSync(fd); } finally { closeSync(fd); }
  return file;
}
