import { failureText } from './failure-report.mjs';

// Bounded reads with the operation's existing GitHub token; no retry is executed.
// Never inspect job logs or forward request/response errors or credential values.
export function runnerStartFailure(job, annotations) {
  if (job?.status !== 'completed' || !['cancelled', 'timed_out'].includes(job.conclusion) ||
      typeof job.runner_name !== 'string' || !job.runner_name.trim() ||
      !Array.isArray(job.steps) || job.steps.some(step => step.conclusion !== 'skipped') ||
      !Array.isArray(annotations)) return null;
  const timeout = annotations.find(item => item.annotation_level === 'failure' &&
    /^The job has exceeded the maximum execution time of \d+(?:h\d+)?m\d+s\.?$/.test(item.message ?? ''));
  if (!timeout) return null;
  return { class: 'runner_not_started', step: `${job.name} / (runner start)`,
    message: `Job ${job.name}: runner ${job.runner_name} was assigned but executed zero steps; ${timeout.message}` };
}

export function redactDeliveryAnnotation(value, token = '') {
  let line = String(value ?? '').split(/[\r\n]/, 1)[0];
  if (token) line = line.replaceAll(token, '<redacted>');
  return line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, '<url>')
    .replace(/'(?:''|[^'])*'|"(?:\\.|[^"\\])*"|`[^`]*`/g, '<literal>')
    .replace(/\b(?:Bearer\s+\S+|(?:password|secret|token|key|authorization)\s*[:=]\s*\S+)/gi, '<redacted>')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|[A-Za-z0-9_+/-]{32,}={0,2})\b/g, '<redacted>')
    .replaceAll('::', ': :')
    .replace(/[\x00-\x1f\x7f<>]/g, ch => ch === '<' ? '[' : ch === '>' ? ']' : ' ')
    .slice(0, 500);
}

export async function childFailureDiagnostic(error, { token, request, onFailure } = {}) {
  const run = error?.workflowRun;
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/actions\/runs\/([1-9]\d*)$/.exec(run?.html_url ?? '');
  if (!match || Number(match[2]) !== run.id) return null;
  const repository = match[1];
  const read = request ?? (async suffix => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${suffix}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('diagnostic_read_unavailable');
    return response.json();
  });
  const bad = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure']);
  let job, annotation, availability = 'jobs_unavailable';
  const annotations = [];
  try {
    for (let page = 1; page <= 10 && !job; page++) {
      const data = await read(`actions/runs/${run.id}/jobs?filter=latest&per_page=100&page=${page}`);
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      job = jobs.find(item => item.run_id === run.id && bad.has(item.conclusion));
      if (jobs.length < 100) break;
    }
    availability = job ? 'annotation_unavailable' : 'failed_job_unavailable';
    // Derive the check id; never follow an API-provided URL to another host/repo.
    const check = new RegExp(`^https://api\\.github\\.com/repos/${repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/check-runs/([1-9]\\d*)$`).exec(job?.check_run_url ?? '');
    if (check) {
      for (let page = 1; page <= 10; page++) {
        const data = await read(`check-runs/${check[1]}/annotations?per_page=100&page=${page}`);
        if (!Array.isArray(data)) break;
        annotations.push(...data);
        annotation ??= data.find(item => item.annotation_level === 'failure');
        if (data.length < 100) break;
      }
      if (!annotation) availability = 'no_error_annotation';
    }
  } catch { /* Diagnostic permission/read failures never change the operation. */ }
  const safe = value => redactDeliveryAnnotation(value, token);
  const runnerFailure = runnerStartFailure(job, annotations);
  if (runnerFailure) {
    const message = safe(runnerFailure.message);
    onFailure?.({ code: runnerFailure.class, summary: message, retryable: true });
    return `native_child_failed: child=${run.html_url} job=${safe(job.name)} step=runner start class=runner_not_started error=${message}`;
  }
  const step = job?.steps?.find(item => bad.has(item.conclusion));
  // Structured producers have already masked credentials. Decode their JSON message
  // before the older annotation sanitizer would replace its entire quoted cause.
  const record = /^KOMBIFY_FAILURE class=[a-z_]+ step=("(?:[^"\\]|\\.)*") message=("(?:[^"\\]|\\.)*")$/.exec(annotation?.message ?? '');
  let detail = annotation ? safe(annotation.message) : availability;
  if (record) {
    try {
      detail = failureText(JSON.parse(record[2])).split(/[\r\n]/, 1)[0];
      if (token) detail = detail.replaceAll(token, '[masked]');
    } catch { /* A malformed record keeps the existing safe annotation. */ }
  }
  return `native_child_failed: child=${run.html_url} job=${safe(job?.name ?? 'unavailable')} step=${safe(step?.name ?? 'unavailable')} error=${detail}`;
}

// Native workflows declare proof-only steps with the reporting marker. Every
// other name fails closed, including mixed proof/production and unknown steps.
const mixedProducingStep = name => /\b(?:and|then)\s+(?:build|sign|publish|deploy|activate|promote|migrate|push)\b/i.test(String(name ?? ''));

function releaseStepIsProof(name) {
  if (mixedProducingStep(name)) return false;
  return /^Report release finding:\s+\S/.test(String(name ?? '').trim());
}

export function releaseStepProduces(name) {
  return !releaseStepIsProof(name);
}

export async function childReleaseDisposition(run, { token, request } = {}) {
  const failed = new Set(['failure', 'cancelled', 'timed_out', 'startup_failure', 'action_required']);
  const failedRun = failed.has(run?.conclusion);
  const match = /^https:\/\/github\.com\/(KombiverseLabs\/[A-Za-z0-9_.-]+)\/actions\/runs\/([1-9]\d*)$/.exec(run?.html_url ?? '');
  if (!match || Number(match[2]) !== run.id) return { producingFailed: failedRun, complete: false, findings: [{ cause: 'delivery.child-identity-unreadable', summary: 'Child execution could not be observed.' }] };
  const read = request ?? (async suffix => {
    const response = await fetch(`https://api.github.com/repos/${match[1]}/${suffix}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('child jobs unavailable');
    return response.json();
  });
  const jobs = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const data = await read(`actions/runs/${run.id}/attempts/${run.run_attempt ?? 1}/jobs?per_page=100&page=${page}`);
      if (!Array.isArray(data?.jobs)) throw new Error('child jobs unavailable');
      jobs.push(...data.jobs);
      if (jobs.length >= data.total_count) break;
      if (page === 10 || !data.jobs.length) throw new Error('child jobs incomplete');
    }
  } catch {
    return { producingFailed: failedRun, complete: false, findings: [{ cause: 'delivery.child-observation-incomplete', summary: 'Child job inventory is unreadable; inspect the acknowledged run before retrying.' }] };
  }
  const producing = jobs.flatMap(job => (job.steps ?? []).filter(step => releaseStepProduces(step.name)));
  const failedJobs = jobs.filter(job => failed.has(job.conclusion));
  const proofOnlyFailures = failedJobs.every(job => {
    const failures = (job.steps ?? []).filter(step => failed.has(step.conclusion));
    return failures.length > 0 && failures.every(step => releaseStepIsProof(step.name)) &&
      !(job.steps ?? []).some(step => releaseStepProduces(step.name) && step.conclusion === 'skipped');
  });
  const producingFailed = producing.some(step => failed.has(step.conclusion)) ||
    (failedRun && (!failedJobs.length || failedJobs.some(job =>
      !(job.steps ?? []).some(step => failed.has(step.conclusion)))));
  const findings = jobs.flatMap(job => (job.steps ?? []).filter(step => failed.has(step.conclusion) && !releaseStepProduces(step.name))
    .map(step => ({ cause: `child:${job.name}:${step.name}`, summary: `${job.name} / ${step.name}: ${step.conclusion}` })));
  if (!proofOnlyFailures && !producingFailed) findings.push({ cause: 'delivery.child-production-pending', summary: 'The failed child does not establish completion of every producing step.' });
  const activated = producing.some(step => /^(?:publish|push|deploy|activate|promote|migrate|apply|export|run public export|create (?:release|deployment)|upload.*(?:release|package|store))\b/i.test(step.name) && step.conclusion === 'success');
  return { producingFailed, complete: activated && !producingFailed && proofOnlyFailures, findings };
}
