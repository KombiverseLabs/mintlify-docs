#!/usr/bin/env node

import { reportDeliveryFinding } from "./lib/delivery-report.mjs";
import { childReleaseDisposition } from "./lib/delivery-failure-diagnostic.mjs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const OPERATIONS = new Set(["build", "validate", "publish", "promote", "smoke", "async"]);
const PLAN_POINTER_PATTERNS = {
  DELIVERY_PLAN_RUN_ID: /^[1-9][0-9]*$/,
  DELIVERY_PLAN_REPOSITORY: /^[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/,
  DELIVERY_PLAN_ARTIFACT_NAME: /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/,
  DELIVERY_STANDARDS_REF: /^[0-9a-f]{40}$/,
};

function fail(message) {
  throw new Error(`Delivery repository runtime: ${message}`);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function substitute(value, variables) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_match, name) => {
    if (!(name in variables)) fail(`unknown template variable ${name}`);
    // Only opted-in consumers require a pointer. Never trim malformed values
    // into a different repository, run, or artifact identity.
    const pointerPattern = PLAN_POINTER_PATTERNS[name];
    if (pointerPattern && pointerPattern.exec(variables[name])?.[0] !== variables[name]) {
      fail(`${name} must be a non-empty safe Actions plan artifact pointer`);
    }
    return variables[name];
  });
}

export function deliveryOperationProfileKey(profile) {
  switch (profile) {
    case "fast-pre-1.0": return "fast";
    case "stable-1.0-plus": return "stable";
    case "early-access": return "early-access";
    default: fail("DELIVERY_PROFILE must be fast-pre-1.0, stable-1.0-plus or early-access");
  }
}

export function deliveryOperationSteps(spec, profile, label = "operation") {
  const profileKey = deliveryOperationProfileKey(profile);
  if (Array.isArray(spec) && profileKey !== "early-access") return spec;
  if (!spec || typeof spec !== "object") {
    fail(`${label} must be a step array or a profile map`);
  }
  const steps = Object.hasOwn(spec, profileKey) ? spec[profileKey]
    : profileKey === "early-access" ? undefined : spec.default;
  if (!Array.isArray(steps) || steps.length === 0) {
    fail(`${label}.${profileKey} must be a nonempty explicit step array`);
  }
  return steps;
}

// A group's role in its product's release (CI-CD-PLATFORM-STANDARD.md §4.6
// "Side publications"). Absent is "gating": a group that does not complete
// fails the Delivery, as before. "side" is a side publication (a package
// registry, a store build, a public source mirror): the shared
// delivery-operation.yml reports its failed publish, promote or stable smoke as
// a side outcome of its own and keeps the Delivery run green. Any other value
// refuses before an effect, so a typo never turns a gating group into a side one.
export const SIDE_RELEASE_ROLE = "side";
export function deliveryGroupReleaseRole(group) {
  if (!group || typeof group !== "object" || !Object.hasOwn(group, "release_role")) return "gating";
  if (group.release_role !== SIDE_RELEASE_ROLE) {
    fail(`group ${group.id ?? "<missing>"} release_role must be "${SIDE_RELEASE_ROLE}" when declared`);
  }

  return SIDE_RELEASE_ROLE;
}

// Artifact policy needs the source-bound contract, not just the group's role field.
export function validateSidePublicationGroup(group, artifacts) {
  if (deliveryGroupReleaseRole(group) !== SIDE_RELEASE_ROLE) return;
  const byId = new Map((artifacts ?? []).map(artifact => [artifact.id, artifact]));
  if (!Array.isArray(group.artifacts) || !group.artifacts.length) fail(`side group ${group.id} has no artifacts`);
  for (const id of group.artifacts) {
    const artifact = byId.get(id);
    if (!artifact?.class || ["container-service", "worker-api", "worker-web", "native-host", "database-migration", "managed-data-service"].includes(artifact.class)) {
      fail(`side group ${group.id} artifact ${id} must resolve to a publication, never a runtime or data service`);
    }
  }
}

// A child counts for the operation when its run completed successfully or its
// activation readback was observed (`complete_at`). A `trailing` child only
// follows such a child and never decides the operation.
const settledWorkflow = (run) =>
  (run.status === "completed" && run.conclusion === "success") || Boolean(run.activation) || run.production_complete === true;

// The GitHub Actions run statuses that mean the acknowledged child is still
// running (not yet terminal). An ignition-only step (`wait_for_completion:
// false`) is only "ignited asynchronously" when its run is observably in one of
// these statuses. An unconfirmed `unknown` or missing status is never ignition
// and stops the steps after it exactly like an unsettled observed child.
const ACTIVE_WORKFLOW_STATUSES = new Set(["queued", "in_progress", "waiting", "pending", "requested"]);
const WORKFLOW_RUN_STATUSES = new Set([...ACTIVE_WORKFLOW_STATUSES, "completed"]);

// This is an operation observation, not publication authority. The shared
// workflow binds it to its already validated plan before composing a receipt.
export function readDeliveryOperationResult(serialized, expected) {
  if (!serialized) return { status: "pending", evidence: [] };
  const result = JSON.parse(serialized);
  const fields = ["schema_version", "status", "workflows", "deferred", "ui_lab_uploads", ...Object.keys(expected)];
  if (
    !result || Array.isArray(result) || result.schema_version !== 1 ||
    Object.keys(result).some((key) => !fields.includes(key)) ||
    Object.entries(expected).some(([key, value]) =>
      typeof value !== "string" || value === "" || result[key] !== value) ||
    !["pending", "passed"].includes(result.status) ||
    !Array.isArray(result.workflows) || !Array.isArray(result.deferred) ||
    result.deferred.some((value) => typeof value !== "string" || !value.trim())
  ) fail("operation result does not match the admitted plan and operation");
  const evidence = [];
  for (const run of result.workflows) {
    if (
      !run || Array.isArray(run) ||
      Object.keys(run).some((key) => !["repository", "run_id", "head_sha", "status", "conclusion", "activation", "trailing", "production_complete"].includes(key)) ||
      (run.production_complete !== undefined && typeof run.production_complete !== "boolean") ||
      (run.trailing !== undefined && (run.trailing !== true || run.activation !== undefined ||
        (run.status === "completed" && run.conclusion !== "success"))) ||
      (run.activation !== undefined && (
        !run.activation || Array.isArray(run.activation) || typeof run.activation !== "object" ||
        Object.keys(run.activation).some((key) => !["job_id", "job", "step"].includes(key)) ||
        !Number.isSafeInteger(run.activation.job_id) || run.activation.job_id <= 0 ||
        typeof run.activation.job !== "string" || run.activation.job.trim() === "" ||
        (run.activation.step !== undefined && (typeof run.activation.step !== "string" || run.activation.step.trim() === ""))
      )) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(run.repository ?? "") ||
      !Number.isSafeInteger(run.run_id) || run.run_id <= 0 ||
      !/^[0-9a-f]{40}$/.test(run.head_sha ?? "") ||
      !WORKFLOW_RUN_STATUSES.has(run.status) ||
      !(run.conclusion === null || /^[a-z_]+$/.test(run.conclusion ?? "")) ||
      (result.status === "passed" && !run.trailing && !settledWorkflow(run))
    ) fail("operation result contains invalid workflow evidence");
    evidence.push({
      kind: run.status === "completed" && run.conclusion === "success"
        ? "github-workflow-completed" : "github-workflow-acknowledged",
      uri: `https://github.com/${run.repository}/actions/runs/${run.run_id}`,
    });
    // The child's activation readback: the exact job the observation ended at.
    if (run.activation) {
      evidence.push({
        kind: "github-workflow-activation-confirmed",
        uri: `https://github.com/${run.repository}/actions/runs/${run.run_id}/job/${run.activation.job_id}`,
      });
    }
  }
  if (result.status === "passed" && result.deferred.length > 0) {
    fail("delegated operation evidence cannot be passed");
  }
  if (result.workflows.some((run) => run.trailing) && !result.workflows.some((run) => !run.trailing && settledWorkflow(run))) {
    fail("trailing workflow evidence needs the settled activation it follows");
  }
  const uploads = result.ui_lab_uploads ?? [];
  if (!Array.isArray(uploads) || (uploads.length && (expected.profile !== "early-access" || expected.operation !== "publish"))) {
    fail("Worker upload evidence belongs only to the admitted Early Access publication");
  }
  if (expected.profile === "early-access" && expected.operation === "publish" && result.status === "passed" && uploads.length !== 1) {
    fail("Early Access publication requires one retained Worker upload observation");
  }
  for (const upload of uploads) {
    const keys = ["schema", "source_sha", "plan_digest", "release_id", "child_run_id", "artifact_id", "archive_digest",
      "worker_version_id", "preview_url", "target_id", "authenticated_acceptance"];
    if (!upload || Object.keys(upload).length !== keys.length || Object.keys(upload).some(key => !keys.includes(key)) ||
        upload.schema !== "delivery.ui-lab-upload-observation/v1" || upload.source_sha !== expected.source_sha ||
        upload.plan_digest !== expected.plan_digest || upload.release_id !== expected.release_id ||
        !Number.isSafeInteger(upload.child_run_id) || upload.child_run_id <= 0 ||
        !Number.isSafeInteger(upload.artifact_id) || upload.artifact_id <= 0 ||
        !/^sha256:[a-f0-9]{64}$/.test(upload.archive_digest ?? "") ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(upload.worker_version_id ?? "") ||
        !/^https:\/\/[a-f0-9]{8}-kombify-ui-lab\.[a-z0-9-]+\.workers\.dev$/.test(upload.preview_url ?? "") ||
        !upload.preview_url.startsWith(`https://${upload.worker_version_id.slice(0, 8)}-`) ||
        upload.target_id !== "brand-ui-lab-cloudflare-worker-early-access" || upload.authenticated_acceptance !== "pending-m13" ||
        !result.workflows.some(run => run.run_id === upload.child_run_id && run.repository === "KombiverseLabs/kombify-Brand" &&
          run.status === "completed" && run.conclusion === "success")) fail("Worker upload observation does not match the exact child");
    evidence.push({ kind: "worker-version-preview", uri: upload.preview_url });
    evidence.push({ kind: "worker-version-upload-receipt", uri: `https://github.com/KombiverseLabs/kombify-Brand/actions/runs/${upload.child_run_id}/artifacts/${upload.artifact_id}`,
      digest: upload.archive_digest });
  }
  return { status: result.status, evidence };
}

async function resolveRunnerCustody(config) {
  const custody = config.runner_custody;
  let runner = process.env.DELIVERY_RUNNER ?? "";
  let contract = process.env.DELIVERY_RUNNER_CONTRACT ?? "";
  if (!custody) return { runner, contract };

  const input = custody.input ?? "runner";
  if (runner === "" && contract === "" && process.env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    const eventPath = process.env.GITHUB_EVENT_PATH ?? "";
    if (eventPath !== "") {
      const event = JSON.parse(await readFile(eventPath, "utf8"));
      runner = String(event.inputs?.[input] ?? "");
      contract = runner === "" ? "" : requireString(custody.contract, "runner_custody.contract");
    }
  }

  const allowed = Array.isArray(custody.allowed) ? custody.allowed : [];
  if (runner !== runner.trim() || (runner !== "" && !allowed.includes(runner))) {
    fail(`${input} must be empty or one of runner_custody.allowed`);
  }
  const expectedContract =
    runner === "" ? "" : requireString(custody.contract, "runner_custody.contract");
  if (contract !== expectedContract) {
    fail(`DELIVERY_RUNNER_CONTRACT must equal ${expectedContract || "empty"}`);
  }
  return { runner, contract };
}

export function assertCandidateFeatureAcceptance(receipt, { required = false, bundleRoot } = {}) {
  const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
  const hash = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  const portable = (value) => nonempty(value) && !/^[\\/]|^[A-Za-z]:/.test(value) && !value.includes("\\") && !value.split("/").some((part) => ["", ".", ".."].includes(part));
  const deny = (message) => { throw new Error(`Candidate feature acceptance: ${message}`); };
  let acceptedScopes = 0;
  const root = bundleRoot ? realpathSync(bundleRoot) : null;
  const check = (acceptance) => {
    if (!acceptance || acceptance.status !== "passed") deny("declared acceptance is not closed");
    acceptedScopes += 1;
    if (acceptance.source_sha !== receipt.sha || !nonempty(acceptance.scope)) deny("source/scope mismatch");
    if (!portable(acceptance.producer?.path) || !hash(acceptance.producer?.sha256)) deny("producer binding missing");
    if (!Array.isArray(acceptance.artifacts) || acceptance.artifacts.length === 0 ||
        acceptance.artifacts.some((item) => !portable(item.path) || !hash(item.sha256))) deny("artifact bindings missing");
    if (root) {
      for (const artifact of [acceptance.producer, ...acceptance.artifacts]) {
        const file = realpathSync(path.resolve(root, artifact.path));
        const relative = path.relative(root, file);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ||
            createHash("sha256").update(readFileSync(file)).digest("hex") !== artifact.sha256) {
          deny(`bundle evidence digest mismatch: ${artifact.path}`);
        }
      }
    }
    const proofPaths = new Set([acceptance.producer.path, ...acceptance.artifacts.map((item) => item.path)]);
    for (const name of ["functional", "cleanup"]) {
      const section = acceptance[name];
      if (section?.status === "not_required" && name === "cleanup" && nonempty(section.reason)) continue;
      if (section?.status !== "passed" || !Array.isArray(section.effects) || section.effects.length === 0 ||
          section.effects.some((effect) => !nonempty(effect.assertion) || !nonempty(effect.observation) ||
            !Array.isArray(effect.evidence) || effect.evidence.length === 0 || effect.evidence.some((ref) => !nonempty(ref) || !proofPaths.has(ref.split("#")[0])))) {
        deny(`${name} effects are not verified`);
      }
    }
    const visual = acceptance.visual;
    if (visual?.status === "not_required") {
      if (!nonempty(visual.reason)) deny("visual omission needs a risk-based reason");
    } else {
      if (visual?.status !== "passed" || !nonempty(visual.evaluator) ||
          !Number.isFinite(Date.parse(visual.evaluated_at)) ||
          Date.parse(visual.evaluated_at) > Date.now() + 300_000 ||
          !Array.isArray(visual.images) || visual.images.length === 0 ||
          visual.images.some((image) => image.verdict !== "passed" || !portable(image.path) ||
            !hash(image.sha256) || !nonempty(image.expected_outcome) || !nonempty(image.evaluator) ||
            !acceptance.artifacts.some((artifact) => artifact.path === image.path && artifact.sha256 === image.sha256) ||
            !Array.isArray(image.findings) || image.findings.length === 0 || image.findings.some((finding) => !nonempty(finding)))) {
        deny("selected images have no passing evaluated verdict");
      }
    }
  };
  const visit = (entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) deny("malformed phase record");
    if (Object.hasOwn(entry, "phases") && !Array.isArray(entry.phases)) deny("malformed phase list");
    if (Object.hasOwn(entry, "feature_acceptance")) check(entry.feature_acceptance);
    for (const phase of entry.phases ?? []) visit(phase);
  };
  visit(receipt);
  if (required && acceptedScopes === 0) deny("affected runtime effect proof is missing");
}

async function runProcess(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}`));
      } else if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

// A conditional GET that answers 304 is not charged to the REST rate limit, so
// polling an unchanged run costs nothing against the shared token.
const conditionalReads = new Map();

// A request that exceeded the primary or secondary rate limit was not
// executed, so waiting for the reset and repeating it is safe. Anything else
// (including an unreadable reset) fails as before.
const RATE_LIMIT_MAX_WAIT_MS = 15 * 60 * 1000;
const TRANSIENT_READ_RETRIES = 5;

function rateLimitWaitMs(response, body, attempt) {
  const header = (name) => response.headers?.get?.(name) ?? null;
  const retryAfter = header("retry-after");
  const exhausted = header("x-ratelimit-remaining") === "0";
  const limited =
    response.status === 429 ||
    (response.status === 403 && (exhausted || retryAfter !== null || /rate limit/i.test(body)));
  if (!limited) return null;
  if (retryAfter !== null) return Number(retryAfter) * 1000;
  const reset = Number(header("x-ratelimit-reset"));
  if (exhausted && reset > 0) return Math.max(0, reset * 1000 - Date.now()) + 1000;
  return 60_000 * 2 ** (attempt - 1);
}

// `window` (optional) is the life of a GitHub App token: its require(phase, neededMs)
// throws a named error before a request or a wait would end after it. Without it
// the token is the job's own github.token, which lives as long as the job.
async function githubRequest(token, url, options = {}, notFoundDeadline = 0, window = null) {
  const method = options.method ?? "GET";
  const cached = method === "GET" ? conditionalReads.get(url) : undefined;
  let waited = 0;
  for (let attempt = 1; ; attempt += 1) {
    window?.require("github-request");
    let response;
    let bodyText = "";
    try {
      response = await fetch(url, {
        ...options,
        ...(method === "GET" && !options.signal ? { signal: AbortSignal.timeout(15_000) } : {}),
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "kombify-delivery-v2",
          "x-github-api-version": "2022-11-28",
          ...(cached ? { "if-none-match": cached.etag } : {}),
          ...options.headers,
        },
      });
      // The body is part of the transport: a connection that drops while it is
      // read is as transient as one that fails to open. Parsing stays outside.
      if (response.status !== 304 && response.status !== 204) bodyText = await response.text();
    } catch (error) {
      // A thrown network error on an idempotent read is transient; writes stay
      // single-attempt because the request may already have taken effect.
      if (method !== "GET") throw error;
      if (attempt > TRANSIENT_READ_RETRIES) throw Object.assign(error, { transientRead: true });
      window?.require("read-retry", 5_000 * attempt);
      process.stdout.write(
        `GitHub API ${method} ${url} failed on the network (${error?.message ?? error}); reading again instead of failing the delivery.\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
      continue;
    }
    if (response.status === 304 && cached) return cached.body;
    if (response.ok) {
      if (response.status === 204) return null;
      const body = JSON.parse(bodyText);
      const etag = method === "GET" ? response.headers?.get?.("etag") : null;
      if (etag) conditionalReads.set(url, { etag, body });
      return body;
    }
    const text = bodyText;
    const waitMs = rateLimitWaitMs(response, text, attempt);
    if (waitMs !== null && Number.isFinite(waitMs) && waited + waitMs <= RATE_LIMIT_MAX_WAIT_MS) {
      window?.require("rate-limit-wait", waitMs);
      process.stdout.write(
        `GitHub API ${method} ${url} is rate limited (${response.status}); waiting ${Math.ceil(waitMs / 1000)}s for the limit to reset instead of failing the delivery.\n`,
      );
      waited += waitMs;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    // A server or gateway error on a read says nothing about the run it reads;
    // writes stay single-attempt.
    const retryDelay = 5_000 * attempt;
    const acknowledgedRunNotVisible = response.status === 404 && Date.now() + retryDelay <= notFoundDeadline;
    if (method === "GET" && ([500, 502, 503, 504].includes(response.status) || acknowledgedRunNotVisible) && attempt <= TRANSIENT_READ_RETRIES) {
      window?.require("read-retry", retryDelay);
      process.stdout.write(
        `GitHub API ${method} ${url} answered ${response.status}; reading again instead of failing the delivery.\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      continue;
    }
    throw Object.assign(new Error(
      `GitHub API ${method} ${url} failed (${response.status}${waitMs !== null ? ", rate limited beyond the wait budget" : ""}): ${text.slice(0, 500)}`,
    ), method === "GET" && [500, 502, 503, 504].includes(response.status) ? { transientRead: true } : {});
  }
}

// `tokenWindow` is passed only when GH_TOKEN is a GitHub App installation token
// (one hour). Dispatch needs a usable credential, independently of how much
// observation fits later. An acknowledged child is never dispatched again.
export async function dispatchWorkflow(step, variables, { onAcknowledged, acknowledgedRunId, tokenWindow = null } = {}) {
  if (!onAcknowledged && acknowledgedRunId === undefined) {
    fail("workflow dispatch requires the shared exact-child binding uploader");
  }
  const token = requireString(process.env.GH_TOKEN, "GH_TOKEN");
  const repository = substitute(step.repository ?? variables.SOURCE_REPOSITORY, variables);
  const owner = substitute(step.owner ?? "KombiverseLabs", variables);
  const workflow = substitute(requireString(step.workflow, "workflow step.workflow"), variables);
  const ref = substitute(step.ref ?? "main", variables);
  const inputs = Object.fromEntries(
    Object.entries(step.inputs ?? {}).map(([key, value]) => [
      key,
      String(substitute(value, variables)),
    ]),
  );
  // Configuration reactivation is an explicit opt-in of the committed adapter.
  // Caller input may affect only this boolean, never source or plan identity.
  if (step.dispatch_boolean_inputs !== undefined) {
    const optIn = step.dispatch_boolean_inputs;
    if (
      !optIn ||
      Array.isArray(optIn) ||
      Object.keys(optIn).length !== 1 ||
      optIn.force_deploy !== true ||
      Object.hasOwn(inputs, "force_deploy")
    ) {
      fail(
        "dispatch_boolean_inputs permits only force_deploy: true without a static override",
      );
    }
    inputs.force_deploy = "false";
    if (
      process.env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      process.env.GITHUB_EVENT_PATH
    ) {
      const event = JSON.parse(
        await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
      );
      const executing =
        event.inputs?.execute === true || event.inputs?.execute === "true";
      const force = event.inputs?.force_deploy;
      if (executing) {
        if (
          force !== undefined &&
          ![true, false, "true", "false"].includes(force)
        ) {
          fail("force_deploy must be a boolean dispatch input");
        }
        inputs.force_deploy =
          force === true || force === "true" ? "true" : "false";
      }
    }
  }
  const waitsForCompletion = step.wait_for_completion !== false;
  const timeoutSeconds = Number(
    waitsForCompletion ? (step.timeout_seconds ?? 2700) : (step.ignition_timeout_seconds ?? 90),
  );
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    (!waitsForCompletion && timeoutSeconds > 300)
  ) {
    fail(
      "workflow observation timeout must be a positive integer; ignition is limited to 300 seconds",
    );
  }
  // `complete_at` ends the observation at the child's activation readback: the
  // named job (and step, when given) of the acknowledged run concluded success.
  // What the child still runs after that point is trailing work; its result is
  // the child run's own and never this operation's (CI-CD-PLATFORM-STANDARD.md
  // "Modular evidence and emergency delivery").
  const completeAt = step.complete_at;
  if (completeAt !== undefined) {
    const keys = completeAt && typeof completeAt === "object" && !Array.isArray(completeAt) ? Object.keys(completeAt) : null;
    if (
      !waitsForCompletion || !keys || keys.some((key) => !["job", "step"].includes(key)) ||
      typeof completeAt.job !== "string" || completeAt.job.trim() === "" ||
      (completeAt.step !== undefined && (typeof completeAt.step !== "string" || completeAt.step.trim() === ""))
    ) {
      fail("workflow complete_at needs a job name, an optional step name and an observed (waiting) step");
    }
  }
  // `trailing: true` marks an ignition-only child that only follows an
  // activation an earlier step of the same operation already read back.
  if (step.trailing !== undefined && (step.trailing !== true || waitsForCompletion)) {
    fail("workflow trailing is true and belongs to an ignition-only step");
  }
  const startedAt = Date.now();
  const workflowUrl = `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${encodeURIComponent(workflow)}`;
  const request = (url, options = {}, notFoundDeadline = 0) => githubRequest(token, url, options, notFoundDeadline, tokenWindow);
  let runId = acknowledgedRunId;
  if (runId === undefined) {
    process.stdout.write(
      `Dispatching ${owner}/${repository}/${workflow} at ${ref} with input keys [${Object.keys(inputs).join(", ")}]\n`,
    );
    try {
      tokenWindow?.require(`dispatch ${workflow}`, 30_000);
      const dispatched = await request(`${workflowUrl}/dispatches`, {
        method: "POST",
        body: JSON.stringify({ ref, inputs, return_run_details: true }),
      });
      runId = dispatched?.workflow_run_id;
    } catch (error) {
      error.producingFailure = true;
      throw error;
    }
  }
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    fail("workflow dispatch acknowledgement has no valid workflow_run_id; dispatch will not be repeated");
  }

  // The acknowledgement owns run identity. Never follow response URLs or infer
  // identity from workflow head, title, timing, or concurrent workflow runs.
  const runUrl = `https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}`;
  const observationStartedAt = waitsForCompletion ? startedAt : Date.now();
  const deadline = observationStartedAt + timeoutSeconds * 1000;
  // A dispatch ACK can precede REST visibility. Only this exact acknowledged
  // run's initial read gets the bounded grace; never repeat the dispatch.
  const visibilityDeadline = Math.min(deadline, Date.now() + 90_000);
  let observed = { status: "unknown", conclusion: null, head_sha: null };
  let observedAt = null;
  function report(event) {
    const now = Date.now();
    const phase = Math.min(
      Math.floor((now - observationStartedAt) / 600000) + 1,
      Math.ceil(timeoutSeconds / 600),
    );
    const phaseStartedAt = observationStartedAt + (phase - 1) * 600000;
    const checkpoint = {
      event,
      run_id: runId,
      run_url: `https://github.com/${owner}/${repository}/actions/runs/${runId}`,
      source_sha: variables.SOURCE_SHA,
      workflow_head_sha: observed.head_sha,
      plan_digest: variables.DELIVERY_PLAN_DIGEST,
      plan_run_id: variables.DELIVERY_PLAN_RUN_ID,
      plan_artifact_name: variables.DELIVERY_PLAN_ARTIFACT_NAME,
      release_id: variables.DELIVERY_RELEASE_ID,
      group: variables.DELIVERY_GROUP,
      artifact: variables.DELIVERY_ARTIFACT,
      operation: variables.DELIVERY_OPERATION,
      status: observed.status,
      conclusion: observed.conclusion,
      observed_at_ms: observedAt,
      at_ms: now,
      elapsed_seconds: Math.floor((now - observationStartedAt) / 1000),
      deadline_ms: deadline,
      phase,
      phase_started_at_ms: phaseStartedAt,
      phase_deadline_ms: Math.min(phaseStartedAt + 600000, deadline),
    };
    const line = JSON.stringify(checkpoint);
    process.stdout.write(`Delivery observation ${line}\n`);
    // The Actions log remains the progress record. Persist only the safe ACK
    // in the existing summary before reading the child; never store inputs.
    if (event === "acknowledged" && process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `\nDelivery workflow acknowledgement\n\n\`\`\`json\n${line}\n\`\`\`\n`,
        );
      } catch {
        process.stderr.write(
          "Could not append workflow acknowledgement to Actions summary; exact run identity remains in the log.\n",
        );
      }
    }
  }
  report("acknowledged");
  // The native Actions helper must finalize and independently authenticate this
  // exact binding before this operation can continue. Use the structured REST
  // observation for both binding and completion; do not make a second CLI read.
  const progress = setInterval(() => report("progress"), 30000);
  async function findRun() {
    const run = await request(runUrl, {}, observedAt === null ? visibilityDeadline : 0);
    if (run?.id !== runId) {
      fail(`workflow run response does not match acknowledged run ${runId}`);
    }
    const changed = observed.status !== run.status || observed.conclusion !== run.conclusion;
    observed = {
      status: run.status,
      conclusion: run.conclusion ?? null,
      head_sha: run.head_sha ?? null,
    };
    observedAt = Date.now();
    if (changed) report(run.status === "completed" ? "terminal" : "status");
    return run;
  }

  const runEvidence = (run) =>
    `run_id=${run.id} source_sha=${variables.SOURCE_SHA} workflow_head_sha=${run.head_sha} url=${run.html_url}`;
  const acknowledgedRun = (run, activation) => ({
    id: run.id,
    head_sha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion ?? null,
    html_url: run.html_url,
    ...(activation ? { activation } : {}),
  });
  // One read of the acknowledged run's newest jobs. Only an exact, unique and
  // successful job (and step) is an activation; a failed, cancelled or skipped
  // one stays with the run's own terminal state below.
  async function readActivation() {
    const data = await request(`${runUrl}/jobs?filter=latest&per_page=100`);
    const listed = Array.isArray(data?.jobs) ? data.jobs : [];
    // The name must be unique among all jobs of the run: a run with more jobs
    // than this one page shows cannot prove that, so it is observed to its end.
    if (!Number.isSafeInteger(data?.total_count) || data.total_count !== listed.length) return null;
    const jobs = listed.filter((job) => job?.name === completeAt.job);
    if (jobs.length !== 1) return null;
    const [job] = jobs;
    if (job.run_id !== runId || !Number.isSafeInteger(job.id) || job.id <= 0) return null;
    if (completeAt.step === undefined) {
      if (job.status !== "completed" || job.conclusion !== "success") return null;
    } else {
      const steps = (Array.isArray(job.steps) ? job.steps : []).filter((entry) => entry?.name === completeAt.step);
      if (steps.length !== 1 || steps[0].status !== "completed" || steps[0].conclusion !== "success") return null;
    }
    return { job_id: job.id, job: completeAt.job, ...(completeAt.step === undefined ? {} : { step: completeAt.step }) };
  }

  try {
    if (onAcknowledged) await onAcknowledged({ runId, repository: `${owner}/${repository}`, workflow, ref, childRun: await findRun() });
    /*
     * `wait_for_completion: false` means "do not wait for the deploy to FINISH".
     * It used to also mean "never look again", and that is how CMO stayed dead
     * for nine days: every adapter run ended in `startup_failure` — no job, no
     * logs — while Delivery reported success, because a dispatch the API accepted
     * was the entire success criterion. Delivery was reporting that the message
     * was delivered, not that anything happened.
     *
     * So a fire-and-forget dispatch now still confirms IGNITION: the run exists
     * and has not already died. That is the one failure class an accepted
     * dispatch cannot rule out, it is decided within seconds, and it costs the
     * fast profile a few seconds rather than the minutes that waiting would.
     */
    if (step.wait_for_completion === false) {
      const ignitionSeconds = timeoutSeconds;
      const ignitionDeadline = deadline;
      let run = null;
      while (Date.now() < ignitionDeadline) {
        run = await findRun();
        if (run) {
          if (run.status !== "completed") {
            process.stdout.write(
              `Workflow ${workflow} ignited (${run.status}); pre-1.0 activation continues asynchronously: ${runEvidence(run)}\n`,
            );
            return acknowledgedRun(run);
          }
          process.stdout.write(
            `Workflow ${workflow} completed as ${run.conclusion}: ${runEvidence(run)}\n`,
          );
          if (run.conclusion !== "success") {
            const disposition = await childReleaseDisposition(run, { token });
            for (const finding of disposition.findings) reportDeliveryFinding({ ...finding, child: run.html_url });
            if (disposition.producingFailed) throw Object.assign(new Error(`workflow ${owner}/${repository}/${workflow} failed in a producing step`), { producingFailure: true });
            if (!disposition.complete) reportDeliveryFinding({ cause: "delivery.child-production-pending", summary: "No producing failure was observed; publication remains pending.", child: run.html_url });
            return { ...acknowledgedRun(run), production_complete: disposition.complete };
          }
          return acknowledgedRun(run);
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
      throw new Error(
        `workflow ${owner}/${repository}/${workflow} was dispatched but produced no run within ${ignitionSeconds}s — an accepted dispatch that never ignites is the silent failure this check exists for`,
      );
    }

    // Observe the single acknowledged run until terminal success or the existing
    // 45-minute deadline. Ten-minute phases label observation only: no redispatch,
    // renewed authority, automatic resume or synthetic successful receipt.
    let run = null;
    while (Date.now() < deadline) {
      try {
        run = await findRun();
      } catch (error) {
        // An outage of our own reads says nothing about the acknowledged child
        // (0.42.5, 2026-10-20: a 75 s network failure ended the leg while the
        // child kept running). Once the run has been read, observe it again
        // until the step deadline; an unseen run and a refusal still fail.
        if (!error?.transientRead || observedAt === null) throw error;
        process.stdout.write(
          `Delivery observation could not read run ${runId} (${error.message}); observing it again until the step deadline.\n`,
        );
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(30_000, deadline - Date.now()))));
        continue;
      }
      // A run that already completed successfully is the stronger evidence and
      // needs no job read; every other state asks the jobs first, so a trailing
      // job that failed after the activation readback cannot undo the activation.
      if (completeAt && !(run?.status === "completed" && run.conclusion === "success")) {
        let activation = null;
        try {
          activation = await readActivation();
        } catch (error) {
          // The jobs read only ends the observation earlier. Whatever it fails
          // with decides nothing: the run's own state, read above, still does.
          // An exhausted token window is the exception: no later read can succeed.
          if (error?.tokenWindow) throw error;
          process.stdout.write(
            `Delivery observation could not read the jobs of run ${runId} (${error.message}); observing the run until the step deadline.\n`,
          );
        }
        if (activation) {
          process.stdout.write(
            `Workflow ${workflow} activated at job "${activation.job}"${activation.step ? ` step "${activation.step}"` : ""} (job_id=${activation.job_id}, run status=${run.status} conclusion=${run.conclusion ?? "none"}); the rest of the run is trailing work outside this operation: ${runEvidence(run)}\n`,
          );
          report("activated");
          return acknowledgedRun(run, activation);
        }
      }
      if (run?.status === "completed") {
        process.stdout.write(
          `Workflow ${workflow} completed as ${run.conclusion}: ${runEvidence(run)}\n`,
        );
        if (run.conclusion !== "success") {
          const disposition = await childReleaseDisposition(run, { token });
          for (const finding of disposition.findings) reportDeliveryFinding({ ...finding, child: run.html_url });
          if (disposition.producingFailed) {
            throw Object.assign(new Error(`workflow ${owner}/${repository}/${workflow} failed in a producing step`), { producingFailure: true });
          }
          if (!disposition.complete) reportDeliveryFinding({ cause: "delivery.child-production-pending", summary: "No producing failure was observed; publication remains pending.", child: run.html_url });
          return { ...acknowledgedRun(run), production_complete: disposition.complete };
        }
        return acknowledgedRun(run);
      }
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    reportDeliveryFinding({ cause: "delivery.child-observation-incomplete", summary: `Child observation ended after ${timeoutSeconds}s; the acknowledged run continues.`, child: run?.html_url });
    return acknowledgedRun(run ?? { id: runId, ...observed, html_url: `https://github.com/${owner}/${repository}/actions/runs/${runId}` });
  } catch (error) {
    // Preserve the failure and the last verified observation of the ACK-owned
    // run. A timeout or failed GET never becomes synthetic terminal evidence.
    error.workflowRun = { id: runId, ...observed, observed_at_ms: observedAt,
      html_url: `https://github.com/${owner}/${repository}/actions/runs/${runId}` };
    if (!error.producingFailure) {
      // The code names the failed check; the finite native read facts (never stderr) say which read answered how.
      const native = error?.native_command ?? {};
      const facts = [native.operation, native.http_status && `http_status=${native.http_status}`,
        Number.isSafeInteger(error?.native_read_attempts) && `attempts=${error.native_read_attempts}`].filter(Boolean).join(" ");
      reportDeliveryFinding({ cause: "delivery.child-observation-incomplete", summary: facts ? `${error.message} (${facts})` : error.message,
        code: String(error?.message ?? "").split(" ", 1)[0], child: error.workflowRun.html_url });
      return acknowledgedRun(error.workflowRun);
    }
    throw error;
  } finally {
    clearInterval(progress);
  }
}

async function runHttpSmoke(step, variables) {
  const url = substitute(requireString(step.url, "http step.url"), variables);
  const expected = new Set(step.expected_statuses ?? [200]);
  const timeoutSeconds = Number(step.timeout_seconds ?? 60);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) {
    fail("http timeout_seconds must be an integer between 1 and 300");
  }
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastStatus = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: step.method ?? "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(Math.min(15_000, timeoutSeconds * 1000)),
      });
      lastStatus = response.status;
      if (expected.has(response.status)) {
        process.stdout.write(`HTTP smoke passed: ${url} (${response.status})\n`);
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(
    `HTTP smoke failed for ${url}; last status=${lastStatus ?? "none"}${lastError ? ` error=${lastError.message}` : ""}`,
  );
}

async function executeStep(step, variables, cwd, workflowDispatcher) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    fail("every operation step must be an object");
  }
  const kinds = ["task", "command", "workflow", "http", "assert_files", "satisfied"].filter(
    (key) => key in step,
  );
  if (kinds.length !== 1) {
    fail(`every operation step must declare exactly one supported kind; received ${kinds.length}`);
  }

  if ("task" in step) {
    const task = substitute(requireString(step.task, "step.task"), variables);
    if (task.startsWith("delivery:")) {
      fail("delivery tasks may not recursively invoke another delivery task");
    }
    const args = (step.args ?? []).map((value) => String(substitute(value, variables)));
    await runProcess(
      process.platform === "win32" ? "mise.exe" : "mise",
      ["run", task, ...(args.length > 0 ? ["--", ...args] : [])],
      cwd,
    );
    return;
  }

  if ("command" in step) {
    if (!Array.isArray(step.command) || step.command.length === 0) {
      fail("step.command must be a non-empty argv array");
    }
    const [command, ...args] = step.command.map((value) => String(substitute(value, variables)));
    await runProcess(command, args, cwd);
    return;
  }

  if ("workflow" in step) {
    const run = await workflowDispatcher(
      {
        ...step,
        workflow: step.workflow,
      },
      variables,
    );
    return {
      workflow: {
        repository: `${substitute(step.owner ?? "KombiverseLabs", variables)}/${substitute(step.repository ?? variables.SOURCE_REPOSITORY, variables)}`,
        run_id: run.id,
        head_sha: run.head_sha,
        status: run.status,
        conclusion: run.conclusion,
        ...(run.activation ? { activation: run.activation } : {}),
        ...(run.production_complete !== undefined ? { production_complete: run.production_complete } : {}),
        ...(step.trailing === true ? { trailing: true } : {}),
      },
      ...(run.ui_lab_upload ? { uploadObservation: run.ui_lab_upload } : {}),
    };
  }

  if ("http" in step) {
    await runHttpSmoke({ ...step, url: step.http }, variables);
    return;
  }

  if ("assert_files" in step) {
    if (!Array.isArray(step.assert_files) || step.assert_files.length === 0) {
      fail("step.assert_files must be a non-empty path array");
    }
    for (const relative of step.assert_files) {
      const resolved = path.resolve(cwd, substitute(relative, variables));
      const root = path.resolve(cwd);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        fail(`asserted path escapes the repository: ${relative}`);
      }
      await stat(resolved);
      process.stdout.write(`Artifact input exists: ${path.relative(root, resolved)}\n`);
    }
    return;
  }

  const satisfied = step.satisfied;
  if (!satisfied || typeof satisfied !== "object") {
    fail("step.satisfied must identify its authority and reason");
  }
  const by = substitute(requireString(satisfied.by, "step.satisfied.by"), variables);
  const reason = substitute(requireString(satisfied.reason, "step.satisfied.reason"), variables);
  process.stdout.write(`Delegated to ${by}; evidence remains pending: ${reason}\n`);
  return { deferred: by };
}

export async function runDeliveryOperation({ operation: selectedOperation, workflowDispatcher = dispatchWorkflow } = {}) {
  const operation = selectedOperation ?? process.argv[2] ?? process.env.DELIVERY_OPERATION ?? "";
  if (!OPERATIONS.has(operation)) {
    fail(`operation must be one of ${[...OPERATIONS].join(", ")}`);
  }
  const cwd = process.cwd();
  if (["validate", "smoke", "async"].includes(operation)) {
    process.stdout.write(`${operation}: not run inside release; verification belongs before merge or after activation.\n`);
    return;
  }
  const configPath = path.join(cwd, ".kombify", "delivery-operations.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (config.schema_version !== 1) fail("schema_version must be 1");
  const runnerCustody = await resolveRunnerCustody(config);

  const variables = {
    CANDIDATE_RECEIPT_B64: process.env.CANDIDATE_RECEIPT_B64 ?? "",
    CANDIDATE_BUNDLE_ROOT: process.env.CANDIDATE_BUNDLE_ROOT ?? "",
    REVIEW_RECEIPT_B64: process.env.REVIEW_RECEIPT_B64 ?? "",
    RELEASE_CONFIRM: process.env.RELEASE_CONFIRM ?? "",
    DELIVERY_ARTIFACT: requireString(process.env.DELIVERY_ARTIFACT, "DELIVERY_ARTIFACT"),
    DELIVERY_OPERATION: operation,
    DELIVERY_PLAN_DIGEST: process.env.DELIVERY_PLAN_DIGEST ?? "",
    DELIVERY_PLAN_RUN_ID: process.env.DELIVERY_PLAN_RUN_ID ?? "",
    DELIVERY_PLAN_REPOSITORY: process.env.DELIVERY_PLAN_REPOSITORY ?? "",
    DELIVERY_PLAN_ARTIFACT_NAME: process.env.DELIVERY_PLAN_ARTIFACT_NAME ?? "",
    DELIVERY_STANDARDS_REF: process.env.DELIVERY_STANDARDS_REF ?? "",
    DELIVERY_PROFILE: requireString(process.env.DELIVERY_PROFILE, "DELIVERY_PROFILE"),
    DELIVERY_RELEASE_ID: process.env.DELIVERY_RELEASE_ID ?? "",
    DELIVERY_RUNNER: runnerCustody.runner,
    DELIVERY_RUNNER_CONTRACT: runnerCustody.contract,
    DELIVERY_VERSION: process.env.DELIVERY_VERSION ?? "",
    DELIVERY_TAG: process.env.DELIVERY_TAG ?? "",
    SOURCE_REPOSITORY: process.env.SOURCE_REPOSITORY ?? config.repository_id ?? "",
    SOURCE_SHA: process.env.SOURCE_SHA ?? "",
  };
  deliveryOperationProfileKey(variables.DELIVERY_PROFILE);

  const groups = Array.isArray(config.groups) ? config.groups : [];
  const matches = groups.filter((group) =>
    Array.isArray(group.artifacts) ? group.artifacts.includes(variables.DELIVERY_ARTIFACT) : false,
  );
  if (matches.length !== 1) {
    fail(`artifact ${variables.DELIVERY_ARTIFACT} must resolve to exactly one delivery group`);
  }
  const group = matches[0];
  variables.DELIVERY_GROUP = requireString(group.id, "group.id");
  if (!group.artifacts.includes(group.primary_artifact)) {
    fail(`group ${group.id} primary_artifact must be one of its artifacts`);
  }
  if (group.source_repository !== variables.SOURCE_REPOSITORY) {
    fail(`group ${group.id} source repository does not match ${variables.SOURCE_REPOSITORY}`);
  }
  validateSidePublicationGroup(group, group.release_role === SIDE_RELEASE_ROLE
    ? JSON.parse(await readFile(path.join(cwd, ".kombify", "delivery.json"), "utf8")).artifacts : undefined);

  if (variables.DELIVERY_ARTIFACT !== group.primary_artifact) {
    process.stdout.write(
      `Artifact ${variables.DELIVERY_ARTIFACT}/${operation} is bundled with authority ${group.primary_artifact}/${operation}; no duplicate execution is required.\n`,
    );
    return;
  }
  const steps = deliveryOperationSteps(
    group.operations?.[operation],
    variables.DELIVERY_PROFILE,
    `group ${group.id} operation ${operation}`,
  );
  if (steps.length === 0) {
    fail(`group ${group.id} operation ${operation} may not be empty`);
  }
  const workflows = [];
  const deferred = [];
  const uploads = [];
  for (const [index, step] of steps.entries()) {
    variables.DELIVERY_STEP_INDEX = index;
    if (step?.trailing === true && !workflows.some((run) => !run.trailing && settledWorkflow(run))) {
      fail(`group ${group.id} operation ${operation} step ${index} trails no activation an earlier step read back`);
    }
    const command = step.task ?? (step.command ?? []).join(" ");
    const proof = /(?:^|[\s:/_.-])(?:test|typecheck|lint|check|verify|admission|contract)(?:$|[\s:/_.-])/i.test(command);
    const proofWorkflow = step.inputs?.database_readiness === "true" ||
      /(?:^|[-_.])(?:test|e2e|smoke|verify|readback)(?:[-_.]|$)/i.test(step.workflow ?? "");
    if ("http" in step || "assert_files" in step || proof || proofWorkflow) {
      process.stdout.write(`Step ${index}: verification runs outside release (${command || "HTTP/structural proof"}).\n`);
      continue;
    }
    let result;
    try { result = await executeStep(step, variables, cwd, workflowDispatcher); }
    catch (error) {
      if (!error.workflowRun && ("task" in step || "command" in step)) error.producingFailure = true;
      throw error;
    }
    if (result?.workflow) workflows.push(result.workflow);
    if (result?.deferred) deferred.push(result.deferred);
    if (result?.uploadObservation) uploads.push(result.uploadObservation);
    // An unsettled child stops the later steps, with one exception: a step that
    // opted out of waiting and whose child is still running. That child continues
    // asynchronously, so the steps after it start beside it. Homelab's fast
    // publish starts the Render image build beside the Guard release this way,
    // and the image build waits for the signed release (#3396). The operation
    // stays pending until that child settles. Ignition needs positive
    // confirmation (an active run status), never a merely non-terminal one.
    const ignitedAsynchronously = step.wait_for_completion === false && ACTIVE_WORKFLOW_STATUSES.has(result?.workflow?.status);
    if (result?.workflow && !settledWorkflow(result.workflow) && !ignitedAsynchronously) break;
  }
  const result = {
    schema_version: 1,
    source_repository: variables.SOURCE_REPOSITORY,
    source_sha: variables.SOURCE_SHA,
    plan_digest: variables.DELIVERY_PLAN_DIGEST,
    release_id: variables.DELIVERY_RELEASE_ID,
    profile: variables.DELIVERY_PROFILE,
    group: variables.DELIVERY_GROUP,
    artifact: variables.DELIVERY_ARTIFACT,
    operation,
    plan_run_id: variables.DELIVERY_PLAN_RUN_ID,
    plan_artifact_name: variables.DELIVERY_PLAN_ARTIFACT_NAME,
    status: deferred.length > 0 || workflows.some((run) => !run.trailing && !settledWorkflow(run))
      ? "pending" : "passed",
    workflows,
    deferred,
    ...(uploads.length ? { ui_lab_uploads: uploads } : {}),
  };
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `operation-result=${JSON.stringify(result)}\nproduction-pending=${result.status === "pending"}\n`);
  }
  return result;
}

// Cutover copies this file to .kombify/delivery.mjs; its existing mise task
// wrappers set DELIVERY_OPERATION and import that copy. Importing the workspace
// source for dispatchWorkflow must not start a second delivery operation.
const modulePath = fileURLToPath(import.meta.url);
const generatedTaskWrapper =
  process.env.DELIVERY_OPERATION &&
  path.basename(modulePath) === "delivery.mjs" &&
  path.basename(path.dirname(modulePath)) === ".kombify";
if (
  (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) ||
  generatedTaskWrapper
) {
  runDeliveryOperation().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
