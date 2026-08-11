# AGENTS.md - mintlify-docs

<!-- BEGIN GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->
> Generated from the canonical `## Elastic Development Throughput Policy` section in the workspace
> root `AGENTS.md`. Do not edit this block in a product repository; update
> the root policy and run `mise run agents:throughput:sync`.

## Elastic Development Throughput Policy

- Authority:
  [DEVELOPMENT-THROUGHPUT-STANDARD.md](https://github.com/KombiverseLabs/kombify-workspace/blob/main/DEVELOPMENT-THROUGHPUT-STANDARD.md).
- The primary orchestrator owns decomposition, authority, integration,
  exact-source evidence, activation, and cleanup.
- Scale independent lanes elastically. Never invent a fixed numeric ceiling;
  contract only for observed capacity, rate, credential, entitlement, budget,
  isolation, ownership, or cleanup constraints. Keep useful work moving and
  isolate remediation.
- Dispatch requires verified `gpt-5.6-luna` with `max` reasoning; otherwise keep
  the lane with the primary or use an explicitly bound Luna task. Expand in
  observable batches and clean failed setups before replacement.
- Cost-bearing/provider lanes use unique `run_id`, isolated non-personal test
  identity, exact source/artifact identity, resource ledger, and terminal
  cleanup receipt. Fresh infrastructure is the acceptance baseline.
- Only affected and registered sensitive checks block pre-1.0 merge; broader
  fleets run asynchronously unless required for the current claim.
<!-- END GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->

<!-- BEGIN GENERATED: planning-policy kombify-agent-policy-sync -->
> Generated from `AGENTS.md` in the kombify workspace root. Do not edit this
> block in child repos; update the root policy and run
> `mise run agents:planning:sync`.

## Planning System Policy

- Authority:
  [GITHUB-PROJECTS-PLANNING-STANDARD.md](https://github.com/KombiverseLabs/kombify-workspace/blob/main/GITHUB-PROJECTS-PLANNING-STANDARD.md).
  This section is the source for generated repo blocks; update it here, then run
  `mise --cd <workspace-root> run agents:planning:sync`.
- GitHub Projects owns cross-repo priorities, decisions, blockers, and phase
  gates. Repo `ROADMAP.md` owns milestones; Beads owns all executable detail.
  Cross-reference them; do not synchronize them bidirectionally.
- Check Projects at session boundaries. `roadmap-open-issues` is a one-way Beads
  view; never hand-edit or sync its generated block back. Until
  `platform-o4ql1` closes, `roadmap:update -Sync` still writes to archived
  Linear; ordinary `roadmap:update` remains valid.
- At milestone-relevant close, update repo roadmap gates and run
  `mise --cd <workspace-root> run roadmap:update -- -Repo <repo>`.
<!-- END GENERATED: planning-policy kombify-agent-policy-sync -->

This repository is the Tier-1 public Mintlify documentation surface at
`https://docs.kombify.io`.

## Public authority

- `docs.json` is the Mintlify navigation source of truth.
- `public-safety-policy.json` is the positive anonymous-publication allowlist;
  every page must satisfy both before it is publishable.
- Workspace `DOCUMENTATION-STANDARD.md`, `LANGUAGE-LOCALIZATION-STANDARD.md`,
  `PLATFORM-STRATEGY.md`, and delivery standards remain authoritative; read the
  task-relevant source instead of duplicating it here.
- Product release artifacts and owning product authorities are the evidence for
  public claims. Repository presence, draft metadata, preview status, and
  internal workflows are not release evidence.

## Working rules

- Keep every committed file safe for anonymous publication: no secrets, private
  customer data, operator-only details, internal runbooks, or unsupported claims.
- Add each new MDX page to `docs.json` and verify every navigation target exists.
- Keep implementation-specific documentation in its owning product repository.
- Use lowercase `kombify` unless quoting a proper name or code identifier.
- Follow the localization standard: engineering/source documentation and
  identifiers are English; use the supported customer-language contract without
  claiming locale coverage that is not evidenced.

## Gates and persistence

- Run `mise run check` and `mise run local:e2e` before publication.
- Preserve the gates in `.github/workflows/public-safety.yml`,
  `.github/workflows/parity-gate.yml`, and `.github/workflows/delivery.yml`.
- For live claims, wait for the exact `SOURCE_SHA` with
  `mise run delivery:wait-exact-live`, then run
  `mise run remote:public-safety`.
- Track executable work and bugs in Beads (`bd`); keep milestone scope and exit
  gates in `ROADMAP.md`.
- Preserve unrelated work with isolated worktrees and path-scoped staging.
  Completion requires relevant gates, a commit, and a successful push.
