#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OPERATIONS = new Set([
  "build",
  "validate",
  "publish",
  "promote",
  "smoke",
  "async",
]);

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
    String(receipt.repo ?? "").toLowerCase() !==
      variables.SOURCE_REPOSITORY.toLowerCase() ||
    receipt.sha !== variables.SOURCE_SHA
  ) {
    fail(
      `stable Candidate receipt identity does not match ${variables.SOURCE_REPOSITORY}@${variables.SOURCE_SHA}`,
    );
  }
  const finishedAt = Date.parse(receipt.finished_at ?? "");
  const ageMs = Date.now() - finishedAt;
  if (
    !Number.isFinite(finishedAt) ||
    ageMs < -5 * 60 * 1000 ||
    ageMs > 24 * 60 * 60 * 1000
  ) {
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
      ...(options.headers ?? {}),
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
  const repository = substitute(
    step.repository ?? variables.SOURCE_REPOSITORY,
    variables,
  );
  const owner = substitute(step.owner ?? "KombiverseLabs", variables);
  const workflow = substitute(
    requireString(step.workflow, "workflow step.workflow"),
    variables,
  );
  const ref = substitute(step.ref ?? "main", variables);
  const inputs = Object.fromEntries(
    Object.entries(step.inputs ?? {}).map(([key, value]) => [
      key,
      String(substitute(value, variables)),
    ]),
  );
  const runNameContains =
    step.run_name_contains === undefined
      ? ""
      : substitute(
          requireString(step.run_name_contains, "workflow step.run_name_contains"),
          variables,
        );
  const startedAt = Date.now();
  const workflowUrl = `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${encodeURIComponent(workflow)}`;
  process.stdout.write(
    `Dispatching ${owner}/${repository}/${workflow} at ${ref} with input keys [${Object.keys(inputs).join(", ")}]\n`,
  );
  await githubRequest(token, `${workflowUrl}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs }),
  });
  if (step.wait_for_completion === false) {
    process.stdout.write(
      `Workflow ${workflow} dispatch accepted; pre-1.0 activation continues asynchronously in its authoritative run.\n`,
    );
    return;
  }

  const timeoutSeconds = Number(step.timeout_seconds ?? 780);
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > 840
  ) {
    fail("workflow timeout_seconds must be an integer between 1 and 840");
  }
  const deadline = startedAt + timeoutSeconds * 1000;
  let run = null;
  while (Date.now() < deadline) {
    const runs = await githubRequest(
      token,
      `${workflowUrl}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=25`,
    );
    const candidates = (runs.workflow_runs ?? [])
      .filter((entry) => Date.parse(entry.created_at) >= startedAt - 10_000)
      .filter(
        (entry) =>
          variables.SOURCE_SHA === "" ||
          entry.head_sha === variables.SOURCE_SHA,
      )
      .filter(
        (entry) =>
          runNameContains === "" ||
          String(entry.display_title ?? "").includes(runNameContains),
      )
      .sort((left, right) => right.id - left.id);
    run = candidates[0] ?? run;
    if (run?.status === "completed") {
      process.stdout.write(
        `Workflow ${workflow} completed as ${run.conclusion}: ${run.html_url}\n`,
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
}

async function runHttpSmoke(step, variables) {
  const url = substitute(requireString(step.url, "http step.url"), variables);
  const expected = new Set(step.expected_statuses ?? [200]);
  const timeoutSeconds = Number(step.timeout_seconds ?? 60);
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 1 ||
    timeoutSeconds > 300
  ) {
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
  const kinds = [
    "task",
    "command",
    "workflow",
    "http",
    "assert_files",
    "satisfied",
  ].filter((key) => key in step);
  if (kinds.length !== 1) {
    fail(
      `every operation step must declare exactly one supported kind; received ${kinds.length}`,
    );
  }

  if ("task" in step) {
    const task = substitute(requireString(step.task, "step.task"), variables);
    if (task.startsWith("delivery:")) {
      fail("delivery tasks may not recursively invoke another delivery task");
    }
    const args = (step.args ?? []).map((value) =>
      String(substitute(value, variables)),
    );
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
    const [command, ...args] = step.command.map((value) =>
      String(substitute(value, variables)),
    );
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
  const by = substitute(
    requireString(satisfied.by, "step.satisfied.by"),
    variables,
  );
  const reason = substitute(
    requireString(satisfied.reason, "step.satisfied.reason"),
    variables,
  );
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

  const variables = {
    CANDIDATE_RECEIPT_B64: process.env.CANDIDATE_RECEIPT_B64 ?? "",
    DELIVERY_ARTIFACT: requireString(
      process.env.DELIVERY_ARTIFACT,
      "DELIVERY_ARTIFACT",
    ),
    DELIVERY_OPERATION: operation,
    DELIVERY_PLAN_DIGEST: process.env.DELIVERY_PLAN_DIGEST ?? "",
    DELIVERY_PROFILE: requireString(
      process.env.DELIVERY_PROFILE,
      "DELIVERY_PROFILE",
    ),
    DELIVERY_RELEASE_ID: process.env.DELIVERY_RELEASE_ID ?? "",
    DELIVERY_VERSION: process.env.DELIVERY_VERSION ?? "",
    DELIVERY_TAG: process.env.DELIVERY_TAG ?? "",
    SOURCE_REPOSITORY:
      process.env.SOURCE_REPOSITORY ?? config.repository_id ?? "",
    SOURCE_SHA: process.env.SOURCE_SHA ?? "",
  };
  if (
    !["fast-pre-1.0", "stable-1.0-plus"].includes(
      variables.DELIVERY_PROFILE,
    )
  ) {
    fail("DELIVERY_PROFILE must be fast-pre-1.0 or stable-1.0-plus");
  }

  const groups = Array.isArray(config.groups) ? config.groups : [];
  const matches = groups.filter((group) =>
    Array.isArray(group.artifacts)
      ? group.artifacts.includes(variables.DELIVERY_ARTIFACT)
      : false,
  );
  if (matches.length !== 1) {
    fail(
      `artifact ${variables.DELIVERY_ARTIFACT} must resolve to exactly one delivery group`,
    );
  }
  const group = matches[0];
  requireString(group.id, "group.id");
  if (!group.artifacts.includes(group.primary_artifact)) {
    fail(`group ${group.id} primary_artifact must be one of its artifacts`);
  }
  if (group.source_repository !== variables.SOURCE_REPOSITORY) {
    fail(
      `group ${group.id} source repository does not match ${variables.SOURCE_REPOSITORY}`,
    );
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
