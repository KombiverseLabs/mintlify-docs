#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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

function normalizeSteps(spec, profile, label) {
  if (Array.isArray(spec)) return spec;
  if (!spec || typeof spec !== "object") {
    fail(`${label} must be a step array or a profile map`);
  }
  const profileKey = profile === "stable-1.0-plus" ? "stable" : "fast";
  const steps = spec[profileKey] ?? spec.default;
  if (!Array.isArray(steps)) {
    fail(`${label}.${profileKey} must be a step array`);
  }
  return steps;
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

function verifyStableCandidateReceipt(variables, operation) {
  if (
    variables.DELIVERY_PROFILE !== "stable-1.0-plus" ||
    !["publish", "promote"].includes(operation)
  ) {
    return;
  }
  const encoded = requireString(
    variables.CANDIDATE_RECEIPT_B64,
    "CANDIDATE_RECEIPT_B64 for stable publish/promote",
  );
  let receipt;
  try {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.toString("base64") !== encoded) {
      fail("CANDIDATE_RECEIPT_B64 must be canonical base64");
    }
    receipt = JSON.parse(decoded.toString("utf8"));
  } catch (error) {
    fail(`CANDIDATE_RECEIPT_B64 is not canonical base64 JSON: ${error.message}`);
  }
  if (
    receipt?.schema_version !== 1 ||
    receipt?.kind !== "candidate-e2e" ||
    receipt?.result !== "PASS" ||
    receipt?.exit_code !== 0 ||
    receipt?.dirty !== false
  ) {
    fail("stable Candidate receipt must be a clean Candidate E2E v1 PASS");
  }
  if (
    String(receipt.repo ?? "").toLowerCase() !== variables.SOURCE_REPOSITORY.toLowerCase() ||
    receipt.sha !== variables.SOURCE_SHA
  ) {
    fail(
      `stable Candidate receipt identity does not match ${variables.SOURCE_REPOSITORY}@${variables.SOURCE_SHA}`,
    );
  }
  const finishedAt = Date.parse(receipt.finished_at ?? "");
  const ageMs = Date.now() - finishedAt;
  if (!Number.isFinite(finishedAt) || ageMs < -5 * 60 * 1000 || ageMs > 24 * 60 * 60 * 1000) {
    fail("stable Candidate receipt must be fresh within 24 hours");
  }
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

async function githubRequest(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "kombify-delivery-v2",
      "x-github-api-version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API ${options.method ?? "GET"} ${url} failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

async function dispatchWorkflow(step, variables) {
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
  const startedAt = Date.now();
  const workflowUrl = `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${encodeURIComponent(workflow)}`;
  process.stdout.write(
    `Dispatching ${owner}/${repository}/${workflow} at ${ref} with input keys [${Object.keys(inputs).join(", ")}]\n`,
  );
  const dispatched = await githubRequest(token, `${workflowUrl}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs, return_run_details: true }),
  });
  const runId = dispatched?.workflow_run_id;
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    fail(
      "workflow dispatch acknowledgement has no valid workflow_run_id; dispatch will not be repeated",
    );
  }

  // The acknowledgement owns run identity. Never follow response URLs or infer
  // identity from workflow head, title, timing, or concurrent workflow runs.
  const runUrl = `https://api.github.com/repos/${owner}/${repository}/actions/runs/${runId}`;
  const observationStartedAt = waitsForCompletion ? startedAt : Date.now();
  const deadline = observationStartedAt + timeoutSeconds * 1000;
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
  const progress = setInterval(() => report("progress"), 30000);
  async function findRun() {
    const run = await githubRequest(token, runUrl);
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

  try {
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
            return;
          }
          process.stdout.write(
            `Workflow ${workflow} completed as ${run.conclusion}: ${runEvidence(run)}\n`,
          );
          if (run.conclusion !== "success") {
            throw new Error(
              `workflow ${owner}/${repository}/${workflow} concluded ${run.conclusion} before it could run asynchronously`,
            );
          }
          return;
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
      run = await findRun();
      if (run?.status === "completed") {
        process.stdout.write(
          `Workflow ${workflow} completed as ${run.conclusion}: ${runEvidence(run)}\n`,
        );
        if (run.conclusion !== "success") {
          throw new Error(
            `workflow ${owner}/${repository}/${workflow} concluded ${run.conclusion}`,
          );
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    throw new Error(
      `workflow ${owner}/${repository}/${workflow} did not complete within ${timeoutSeconds}s${run ? ` (${run.html_url})` : ""}`,
    );
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

async function executeStep(step, variables, cwd) {
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
    await dispatchWorkflow(
      {
        ...step,
        workflow: step.workflow,
      },
      variables,
    );
    return;
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
  process.stdout.write(`Satisfied by ${by}: ${reason}\n`);
}

async function main() {
  const operation = process.argv[2] ?? process.env.DELIVERY_OPERATION ?? "";
  if (!OPERATIONS.has(operation)) {
    fail(`operation must be one of ${[...OPERATIONS].join(", ")}`);
  }
  const cwd = process.cwd();
  const configPath = path.join(cwd, ".kombify", "delivery-operations.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (config.schema_version !== 1) fail("schema_version must be 1");
  const runnerCustody = await resolveRunnerCustody(config);

  const variables = {
    CANDIDATE_RECEIPT_B64: process.env.CANDIDATE_RECEIPT_B64 ?? "",
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
  if (!["fast-pre-1.0", "stable-1.0-plus"].includes(variables.DELIVERY_PROFILE)) {
    fail("DELIVERY_PROFILE must be fast-pre-1.0 or stable-1.0-plus");
  }

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

  if (variables.DELIVERY_ARTIFACT !== group.primary_artifact) {
    process.stdout.write(
      `Artifact ${variables.DELIVERY_ARTIFACT}/${operation} is bundled with authority ${group.primary_artifact}/${operation}; no duplicate execution is required.\n`,
    );
    return;
  }
  verifyStableCandidateReceipt(variables, operation);
  const steps = normalizeSteps(
    group.operations?.[operation],
    variables.DELIVERY_PROFILE,
    `group ${group.id} operation ${operation}`,
  );
  if (steps.length === 0) {
    fail(`group ${group.id} operation ${operation} may not be empty`);
  }
  for (const step of steps) {
    await executeStep(step, variables, cwd);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
