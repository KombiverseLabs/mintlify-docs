const GUIDANCE = {
  GITHUB_THROTTLED: ['github', 'The GitHub identity is valid but throttled. Retain the sign-in and retry after the reset.'],
  GITHUB_IDENTITY_INVALID: ['github', 'The GitHub identity is revoked or expired. Resolve the next admitted host identity.'],
  GITHUB_IDENTITY_MISSING: ['github', 'Resolve an admitted host GitHub identity or use cached OAuth access.'],
  GITHUB_EXCHANGE_REFUSED: ['exchange', 'Check the exact repository permission and repository-to-tracker policy.'],
  ADMISSION_READER_UNAVAILABLE: ['admission-reader', 'Inspect the exact signed caller and reusable-workflow reader grant; no writer or credential-cache fallback was attempted.'],
  MCP_CONNECTOR_REQUIRED: ['oauth', 'Use the kombify-Beads connector, or run the device bootstrap with --sign-in.'],
  READ_ONLY_CREDENTIAL_PENDING: ['cache', 'Inspection found no current cached credential. Run the owning repository bootstrap to repair access.'],
  TRACKER_UNAUTHENTICATED: ['context', 'The tracker refused the credential. Resolve access again for this exact owner binding.'],
  TRACKER_FORBIDDEN: ['context', 'The identity cannot access this tracker. Check the repository policy and granted scopes.'],
  TRACKER_THROTTLED: ['context', 'The tracker rate-limited access. Retain the sign-in and wait for the reset.'],
  TRACKER_UNAVAILABLE: ['context', 'Inspect store health and network reachability; keep the existing credential.'],
  CREDENTIAL_CACHE_INVALID: ['cache', 'Check credential-file format and owner-only permissions. Never print or copy its values.'],
  BINDING_INVALID: ['binding', 'Restore the non-secret binding from its manifest owner. No tracker operation was sent.'],
  ACCESS_UNAVAILABLE: ['access', 'Inspect the host bootstrap, repository policy, protected credential cache, and store reachability.'],
};

export function trackerAccessCode(status) {
  return status === 401 ? 'TRACKER_UNAUTHENTICATED' : status === 403 ? 'TRACKER_FORBIDDEN'
    : status === 429 ? 'TRACKER_THROTTLED' : 'TRACKER_UNAVAILABLE';
}

/** Classify known failures without echoing exception text, headers, or response bodies. */
export function accessFailureDiagnostic(error) {
  let code = Object.hasOwn(GUIDANCE, error?.code) ? error.code : 'ACCESS_UNAVAILABLE';
  const message = typeof error?.message === 'string' ? error.message : '';
  if (code === 'ACCESS_UNAVAILABLE') {
    if (/^Invalid Kombify tracker binding$/u.test(message)) code = 'BINDING_INVALID';
    else if (/^GitHub (?:trust|credential) file /u.test(message)) code = 'CREDENTIAL_CACHE_INVALID';
  }
  const [stage, advice] = GUIDANCE[code];
  const fields = [`class=${code}`, `stage=${stage}`];
  if (new Set(['cache', 'github', 'github-host', 'broker', 'oauth', 'app-reader', 'admission-reader', 'machine-key']).has(error?.route)) fields.push(`route=${error.route}`);
  if (Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599) fields.push(`http=${error.status}`);
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(error?.reset ?? '')) fields.push(`retry_after=${error.reset}`);
  return `BEADS_CLOUDFLARE_ACCESS_FAILED ${fields.join(' ')}: ${advice}`;
}
