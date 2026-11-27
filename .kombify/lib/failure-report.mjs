import { appendFileSync } from 'node:fs';

// Warehouse contract: fixed field order; step/message are JSON strings on one line.
export function failureText(value) {
  let text = String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'CALLER_WORKFLOW_TOKEN', 'AI_NATIVE_TOKEN']) {
    if (process.env[name]) text = text.replaceAll(process.env[name], '[masked]');
  }
  return text.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[masked]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [masked]')
    .replace(/((?:password|secret|token|authorization|private[_-]?key)\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, '$1[masked]');
}

export function failureClass(message) {
  if (/(?:github(?:_api)?|api\.github\.com|\bgh:)/i.test(message) &&
      /(?:HTTP[ :]+|status[ :=]+|server error[ :]+|\bgh:.*?)[5]\d\d\b/i.test(message)) return 'github_api_transient';
  if (/Invalid keyData|private key|token.*(?:missing|not minted)|credential.*(?:missing|unavailable)/i.test(message)) return 'configuration_error';
  if (/\[(?:posthog-|direct-posthog-)|\bP[012]\s+.*workflow-|\[workflow-/.test(message)) return 'policy_violation';
  return 'step_failed';
}

export function emitFailure({ step, message, class: category = failureClass(message) }) {
  const line = `KOMBIFY_FAILURE class=${category} step=${JSON.stringify(failureText(step))} message=${JSON.stringify(failureText(message))}`;
  process.stderr.write(`::error::${line.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      const html = line.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `<pre>${html}</pre>\n`);
    } catch { console.log('::warning::Failure summary unavailable; the failure record remains in the log.'); }
  }
  return line;
}
