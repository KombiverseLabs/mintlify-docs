import { setTimeout as delay } from 'node:timers/promises';
import { accessFailureDiagnostic, trackerAccessCode } from './beads-access-diagnostics.mjs';

const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);

function contextFailure(code, failureClass, status = null) {
  return Object.assign(new Error('Authenticated tracker context unavailable'), { code, failureClass, status });
}

/** Retry this authenticated read only. A context failure never changes identity or sends a mutation. */
export async function readTrackerContext({ base, tracker, token }, { fetchImpl = fetch, delayImpl = delay } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let failure;
    try {
      const response = await fetchImpl(`${base}/t/${encodeURIComponent(tracker)}/v0/beads/context`, {
        headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        failure = contextFailure(trackerAccessCode(response.status), 'http', response.status);
        if (!TRANSIENT_STATUS.has(response.status)) throw failure;
      } else {
        const context = await response.json();
        if (context === null || typeof context !== 'object' || Array.isArray(context))
          throw contextFailure('TRACKER_CONTEXT_INVALID', 'bad_response', response.status);
        return context;
      }
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('TRACKER_')) throw error;
      const timeout = ['TimeoutError', 'AbortError'].includes(error?.name);
      const redirect = /redirect/iu.test(String(error?.cause?.message ?? error?.message ?? ''));
      if (error instanceof SyntaxError || redirect)
        throw contextFailure('TRACKER_CONTEXT_INVALID', redirect ? 'redirect' : 'bad_response');
      failure = contextFailure('TRACKER_UNAVAILABLE', timeout ? 'timeout' : 'network');
    }
    if (attempt === 3) throw failure;
    await delayImpl(attempt * 250);
  }
}

/** A custody subject comes exclusively from a successful authenticated context, never a worker name. */
export function verifiedTrackerSubject(context) {
  const subject = context.data?.x_identity?.verified_principal?.subject;
  if (context.ok && typeof subject === 'string' && subject.trim()) return subject;
  const code = context.ok ? 'TRACKER_IDENTITY_UNVERIFIED' : context.accessCode ?? trackerAccessCode(context.status);
  throw Object.assign(new Error(`${accessFailureDiagnostic({ code, status: context.status, failureClass: context.failureClass })} No tracker mutation was attempted.`), {
    code, failureClass: 'access_rejected', rejected: true,
  });
}
