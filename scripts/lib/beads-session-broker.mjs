// Beads credential for hosts whose GitHub identity is held by a proxy (Claude
// cloud sessions): the GH_TOKEN they see is a placeholder that only github.com
// accepts, so the store's direct GitHub exchange cannot verify it. The session
// keeps an RSA key in memory, dispatches the repository's "Beads session token"
// workflow (.github/workflows/beads-session.yml) through `gh api`, and decrypts
// the store credential the workflow obtained with GitHub OIDC from that run's
// annotation. Progress goes to stderr; nothing here prints the credential.
import { execFileSync } from 'node:child_process';
import { constants, createDecipheriv, createHmac, generateKeyPairSync, privateDecrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export const WORKFLOW = 'beads-session.yml';
export const ANNOTATION_TITLE = 'beads-cloud-session';
// One GitHub call per tick (shared REST budget); the run takes about 15 s.
const FIRST_POLL_MS = 15_000;
const POLL_MS = 15_000;
// Covers the issuing job's 15-minute limit, which includes Depot runner boot.
const TIMEOUT_MS = 16 * 60_000;

// gh shares one REST budget per identity. A spent budget is reported as throttling
// with its reset time, never as a missing login (`gh api rate_limit` is free).
export function throttledError(error, read = () => execFileSync('gh', ['api', 'rate_limit'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 })) {
  if (!/rate limit/i.test(String(error?.stderr ?? '') + String(error?.message ?? ''))) return null;
  let reset = 'its reset';
  try { reset = new Date(JSON.parse(read()).resources.core.reset * 1000).toISOString(); } catch { /* reset unknown */ }
  return new Error(`GitHub REST budget of this gh identity is exhausted (throttled); retry after ${reset}. The gh login is valid: do not sign in again`);
}

const ghApi = (args, input) => {
  try {
    return execFileSync('gh', ['api', ...args], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
  } catch (error) { throw throttledError(error) ?? error; }
};

/** A host may broker when gh reaches GitHub and no Actions OIDC is present. */
export function brokerAvailable(env = process.env, gh = ghApi) {
  if (env.BEADS_CLOUDFLARE_BROKER === '0' || env.ACTIONS_ID_TOKEN_REQUEST_URL) return false;
  // A throttled login is still a login: broker, and let the dispatch report the reset.
  try { return Boolean(JSON.parse(gh(['user'])).login); } catch (error) { return /throttled/.test(String(error?.message)); }
}

// Annotation: wrapped.iv.ciphertext.mac (base64). `wrapped` is RSA-OAEP-SHA256
// over the AES-256-CBC key and the HMAC-SHA256 key; the MAC covers iv || ciphertext.
export function decryptPayload(annotation, privateKey, requestId) {
  const [wrapped, iv, ciphertext, mac] = annotation.split('.').map((part) => Buffer.from(part, 'base64'));
  if (!wrapped?.length || !iv?.length || !ciphertext?.length || !mac?.length) throw new Error('annotation is malformed');
  const keys = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
  if (keys.length !== 64) throw new Error('wrapped key has the wrong length');
  const expected = createHmac('sha256', keys.subarray(32)).update(iv).update(ciphertext).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) throw new Error('annotation MAC does not verify');
  const decipher = createDecipheriv('aes-256-cbc', keys.subarray(0, 32), iv);
  const payload = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
  if (payload.v !== 1 || payload.request_id !== requestId || typeof payload.token !== 'string' || !/^[!-~]+$/.test(payload.token)) {
    throw new Error('annotation does not belong to this request');
  }
  return payload;
}

export async function brokerCredential(config, { gh = ghApi, log = (line) => console.error(line), wait = sleep } = {}) {
  const repo = config.github_repository;
  const requestId = randomBytes(16).toString('hex');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const startedAt = Date.now();
  log(`Beads: requesting a session credential from ${repo} (${WORKFLOW}, about 30 s)`);
  try {
    gh(['-X', 'POST', `repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, '--input', '-'], JSON.stringify({
      ref: 'main', inputs: { request_id: requestId, tracker: config.tracker,
        public_key: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') },
    }));
  } catch { throw new Error(`could not dispatch ${WORKFLOW} in ${repo}; the workflow must exist on main and the session needs write access`); }
  await wait(FIRST_POLL_MS);
  const since = encodeURIComponent(new Date(startedAt - 60_000).toISOString());
  let run = null;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    if (!run) {
      const runs = JSON.parse(gh([`repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&branch=main&per_page=10&created=%3E%3D${since}`])).workflow_runs ?? [];
      run = runs.find((candidate) => (candidate.display_title ?? '').includes(requestId)) ?? null;
    } else run = JSON.parse(gh([`repos/${repo}/actions/runs/${run.id}`]));
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') throw new Error(`${run.html_url} ended with ${run.conclusion}; its log names the reason`);
      const jobs = JSON.parse(gh([`repos/${repo}/actions/runs/${run.id}/jobs`])).jobs ?? [];
      for (const job of jobs) {
        const hit = JSON.parse(gh([`repos/${repo}/check-runs/${job.id}/annotations`]))
          .find((annotation) => annotation.title === `${ANNOTATION_TITLE} ${requestId}`);
        if (!hit) continue;
        const payload = decryptPayload(hit.message.trim(), privateKey, requestId);
        if (payload.tracker !== config.tracker || payload.repository?.toLowerCase() !== repo.toLowerCase()) throw new Error('issued credential is for another tracker');
        return { token: payload.token, expires_at: payload.expires_at, brokered: true };
      }
      throw new Error(`${run.html_url} published no credential annotation`);
    }
    await wait(POLL_MS);
  }
  throw new Error(`no completed ${WORKFLOW} run for this request within ${TIMEOUT_MS / 1000} s`);
}
