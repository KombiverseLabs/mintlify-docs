// OAuth route to the Kombify tracker for hosts without an exchangeable GitHub identity (H2,
// 2026-10-17). The Worker is its own OAuth authorization server; sign-in goes through Cloudflare
// Access to the Kombify Auth0 tenant (login.kombify.io). Its access tokens are accepted on /t/ and
// /mcp alike and are bounded to the trackers of the repository policy, so the governed writer can
// use one exactly like an exchanged credential. The protected cache retains the refresh token
// and its current expiring access token so inspection can read without rotating credentials.
// A host with neither a cached sign-in nor a browser gets the connector route.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { githubCredentialFresh, readGithubCredentials, updateCredentialFile } from './beads-github-auth.mjs';

export const CONNECTOR = { name: 'kombify-Beads', path: '/mcp' };
const SCOPE = 'beads:read beads:write offline_access';
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');

function connectorRequired(base) {
  return Object.assign(new Error(`No OAuth sign-in on this host; use the ${CONNECTOR.name} connector (${base}${CONNECTOR.path}) and its beads_* tools`), { code: 'MCP_CONNECTOR_REQUIRED' });
}

async function tokenRequest(base, form, fetchImpl) {
  const response = await fetchImpl(`${base}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...form, resource: base }), redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) { await response.body?.cancel(); return null; }
  const body = await response.json();
  return typeof body.access_token === 'string' && /^[!-~]+$/.test(body.access_token) ? body : null;
}

const entryOf = (body) => {
  const seconds = body.expires_in === undefined ? 3600 : Number(body.expires_in);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('OAuth token lifetime is invalid');
  return { token: body.access_token, expires_at: new Date(Date.now() + seconds * 1000).toISOString(), route: 'oauth' };
};

export function heldOauthCredential(credentials, base) {
  const cached = credentials[base]?.oauth;
  const entry = { token: cached?.access_token, expires_at: cached?.expires_at, route: 'oauth' };
  return githubCredentialFresh(entry) ? entry : null;
}

async function remember(file, base, client_id, refresh_token, entry) {
  if (!file) return;
  await updateCredentialFile(file, (doc) => {
    doc[base] = { ...doc[base], oauth: { client_id,
      ...(typeof refresh_token === 'string' ? { refresh_token } : {}),
      access_token: entry.token, expires_at: entry.expires_at } };
    return doc;
  });
}

/** Loopback authorization code with PKCE: the browser signs in, this process only receives the code. */
async function signIn(base, { fetchImpl, log, open, timeoutMs = 300_000 }) {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const redirect = `http://127.0.0.1:${server.address().port}/callback`;
  try {
    const registered = await fetchImpl(`${base}/oauth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ client_name: 'kombify workspace (beads-cloudflare-access)', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE }),
    });
    if (!registered.ok) throw new Error('OAuth client registration refused');
    const { client_id } = await registered.json();
    const verifier = b64(randomBytes(32)); const state = b64(randomBytes(16));
    const url = new URL(`${base}/authorize`);
    url.search = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: redirect, scope: SCOPE, state, code_challenge: b64(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', resource: base });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OAuth sign-in timed out')), timeoutMs);
      server.on('request', (req, res) => {
        const got = new URL(req.url, redirect);
        if (got.pathname !== '/callback' || got.searchParams.get('state') !== state) { res.writeHead(404).end(); return; } // a stray local request
        const code = got.searchParams.get('code');
        res.writeHead(code ? 200 : 400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(code ? 'Signed in. You can close this tab.' : 'Sign-in failed.');
        clearTimeout(timer);
        code ? resolve(code) : reject(new Error('OAuth sign-in was denied'));
      });
      log(`Sign in to the Kombify tracker in your browser: ${url.href}`);
      open(url.href);
    });
    const body = await tokenRequest(base, { grant_type: 'authorization_code', code, redirect_uri: redirect, client_id, code_verifier: verifier }, fetchImpl);
    if (!body) throw new Error('OAuth token exchange refused');
    return { client_id, body };
  } finally { server.close(); }
}

function openBrowser(url) {
  // rundll32 avoids cmd.exe, which would split the URL at "&".
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* the printed URL still works */ }
}

/**
 * A tracker credential from the cached sign-in (refresh token, rotated on use), else from an
 * interactive sign-in when `interactive` is set; otherwise MCP_CONNECTOR_REQUIRED.
 */
export async function oauthCredential(base, { cacheFile, fetchImpl = fetch, interactive = false, log = (line) => console.error(line), open = openBrowser, timeoutMs } = {}) {
  // Refresh tokens rotate: a concurrent caller may have used ours, so a refusal re-reads the file once.
  let tried;
  for (let attempt = 0; attempt < 2; attempt++) {
    const cached = cacheFile ? readGithubCredentials(cacheFile)?.[base]?.oauth : undefined;
    if (!cached?.client_id || !cached?.refresh_token || cached.refresh_token === tried) break;
    tried = cached.refresh_token;
    const body = await tokenRequest(base, { grant_type: 'refresh_token', refresh_token: cached.refresh_token, client_id: cached.client_id }, fetchImpl);
    if (body) {
      const entry = entryOf(body);
      await remember(cacheFile, base, cached.client_id, body.refresh_token ?? cached.refresh_token, entry);
      return entry;
    }
  }
  if (!interactive) throw connectorRequired(base);
  const { client_id, body } = await signIn(base, { fetchImpl, log, open, timeoutMs });
  const entry = entryOf(body);
  await remember(cacheFile, base, client_id, body.refresh_token, entry);
  return entry;
}
