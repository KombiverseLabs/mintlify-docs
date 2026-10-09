# AGENTS.md - mintlify-docs

Public Mintlify documentation for kombify (Tier 1). `docs.json` is the
navigation source of truth; pages are MDX files.

<!-- BEGIN GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->
> Generated from the canonical `## Kombify Development Standard` section in the workspace
> root `AGENTS.md`. Do not edit this block in a product repository; update
> the root policy and run `mise run agents:throughput:sync`.

## Kombify Development Standard

Binding; `kombify-fast-development` holds the detail.

1. Pre-1.0 (`fast-pre-1.0`): the affected deterministic gate is the only synchronous gate.
2. Test behavior at public boundaries; black-box by default.
3. Add a test only for a regression, core invariant or sensitive boundary (auth, billing, migrations, provider control, signing); lint, type, build, security and schema checks are the baseline, not extra tests.
4. Assert effects, never structure: no fixed counts, presence or existence checks, exact strings, source or doc greps, or snapshots.
5. One behavior, max one test.
6. No coverage or test-count goals pre-1.0.
7. A test that breaks on a behavior-preserving refactor is fixed or deleted.
8. The running app is the feedback loop: a one-command hot-reload dev loop; affected tests under 2 minutes.
9. Delete skipped, dead and superseded tests and code in the slice that obsoletes them.
10. Claims follow evidence: implemented, merged, deployed and live differ; missing evidence is pending.
11. Feature completion accepts passing automated user journeys on browsers, Windows hosts/VMs, Android emulators and iOS simulators. Physical-device and real-user validation belongs to owner-controlled Public Beta, never a generic completion blocker. Apply `DEVELOPMENT-THROUGHPUT-STANDARD.md` section "Automated feature acceptance and Public Beta"; record hardware limitations without claiming untested hardware support.
<!-- END GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->

<!-- BEGIN GENERATED: planning-policy kombify-agent-policy-sync -->
> Generated from `AGENTS.md` in the kombify workspace root. Do not edit this
> block in child repos; update the root policy and run
> `mise run agents:planning:sync`.
>
> Run workspace scripts from the workspace root. For a consumer,
> `session-publish.mjs` takes `--repo <absolute-owning-checkout>` and paths
> relative to that checkout. References to Start mean the workspace `AGENTS.md`.

## Planning System Policy

- GitHub Projects owns cross-repo priorities, `ROADMAP.md` milestones, Beads
  executable work.

## Beads Remote Write Policy

- Cloudflare is the operational Beads authority (owner decision 2026-10-08).
  Dolt remains read-only comparison/performance data. Never fall back to Dolt
  or treat the derived .beads/issues.jsonl export as current tracker state.
- Each repository carries its non-secret store binding. Run
  `node scripts/beads-cloudflare-access.mjs` on a new host/clone and require
  `BEADS_CLOUDFLARE_ACCESS_OK`; the governed writer bootstraps it automatically.
  Use the checksum-pinned Cloudflare-capable bd from `beads:session-tools`.
- Mutate only through
  `mise --cd <workspace-root> run beads:write --repo <manifest-id> -- <bd args>`
  and require `BEADS_REMOTE_WRITE_OK ... tracker=cloudflare` after independent
  remote readback. An uncertain write is inspected, never replayed.
- GitHub user identity or approved CI OIDC grants expiring tracker-scoped access;
  no Cloudflare token is committed or manually copied between environments.
- Setup, recovery and migration: [Beads Cloudflare Standard](https://github.com/KombiverseLabs/kombify-workspace/blob/main/BEADS-REMOTE-WRITE-STANDARD.md).

## Public Beta Drift Guard

- Scope fence first: before feature work, name the slice and its objective;
  work outside it waits. A blocked slice is recorded with evidence, then the
  next slice in scope starts; never substitute other work.
- No silent fallback: a missing prerequisite fails closed with a clear error.
- "supported" in a catalog or matrix needs apply evidence at the current pin;
  a release or repin is not proof.
- Keep `main` green; regenerate generated files with repository tooling.
- A late or missing scheduled job is reported as a blocker; never dispatch
  workflows, add triggers or work around missing permissions.
- Every bundled binary or provider has a `THIRD-PARTY-NOTICES.md` entry.
- Keep the tracker and the execution log current with each slice.
- Consolidate PRs per phase (one commit per slice) and minimise CI runs: run
  the affected gate locally, push finished work once, no empty commits.

## Git And Completion

- Track the task in Beads; work in the primary checkout on the synced `main`
  and publish only your own paths or hunks to a PR branch with
  `node scripts/session-publish.mjs`, never by switching the checkout's
  branch. A worktree is the last resort under "Main first, shared second,
  worktree last" in Start (owner rule 2026-10-08).
- Collect and review parallel changes locally before publishing the finished
  batch. Use one PR unless dependent slices benefit from separate reviews;
  then use a native stack (`gh stack submit`) and merge it whole with
  `gh stack merge` where possible.
  Commit locally while iterating; push only finished work. Run the affected
  gate, then publish the package or batch once, ready for review
  (`gh pr create` without `--draft`, `gh stack submit --auto --open`): an
  opened ready PR gets its required evidence without a close/reopen. Drafts
  are only for explicitly requested early review. Every generated
  `merge_group` still needs its own checks. Queue the squash-merge yourself
  (`gh pr merge --squash --auto`)
  and continue with the next package instead of polling; settle merge, DIRTY
  and red states at the next checkpoint. Never park a mergeable PR or hand
  the merge to the owner. If a permission blocks it, name the block and ask
  for that permission. Commit as the GitHub identity your token acts as.
- Build phase and test window
  ([decision](https://github.com/KombiverseLabs/kombify-workspace/blob/main/internal/records/DECISION-RECORD-2026-10-04-build-phase-test-window.md)):
  per PR only the affected gate and the unchanged security checks run.
  - Heavy real-host/device, provider provisioning and compatibility acceptance
    runs happen **only in a declared test window**. Only the window
    orchestrator starts them; sessions never dispatch them. Narrow module/flow
    development probes on owned isolated nonproduction remote/device state
    are admitted by effects and isolation under the development standard.
  - A freeze applies only to repositories with a positive native
    `KOMBIFY_TEST_WINDOW_SCOPE` reservation. There, merge only admitted
    `window-fix` changes. Independent repositories continue normally. Missing
    or unreadable scope proof fails closed. No re-runs without a diagnosed cause.
- Batch release and activation: merging a release-preparation PR and
  dispatching Delivery happen once per completed batch. Inside a guarded
  window, registered source gates may admit the canonical generated
  preparations and publications needed for runtime acceptance before its final
  report. Retain original code candidate, true product/artifact sources and
  authenticated publication provenance; preserve all Delivery effect gates.
  At close, reconcile ACKs and execute only remaining admitted train work. Start the next package while
  Delivery runs; read back live state at the checkpoint. An explicit owner
  request to ship a `fast-pre-1.0` product authorizes the acting session to
  execute one scoped release checkpoint outside window close, subject to
  positive absence of a conflicting reservation and the compiled Delivery
  protections. Use the existing privileged manual workflow; no extra approval
  round. Broad acceptance stays `pending-window`/`unverified`.
- A merge is not live: ship only through the `kombify-ship` skill
  (`kombify-workspace/.agents/skills/kombify-ship/SKILL.md`).
- Close Beads issues after the merge SHA exists; reconcile your merged paths
  (`node scripts/session-publish.mjs --after-merge -- <paths>`) and remove a
  last-resort worktree with `git worktree remove`.
- Report committed, merged, deployed and live state with evidence, plus any
  exact blocker.
<!-- END GENERATED: planning-policy kombify-agent-policy-sync -->

## Sources

- Workspace `DOCUMENTATION-STANDARD.md` (tier model, Tier-1 rules, Brand bind)
  and `PLATFORM-STRATEGY.md` (product naming, public/internal boundaries);
  `kombify-Core/standards/REPO-FILE-SCHEMA.md` for root metadata.
- Repository gates: `.github/workflows/public-safety.yml` (public allowlist)
  and `.github/workflows/parity-gate.yml` (generated-MDX frontmatter).

## Working Rules

- Register every new page in `docs.json`; verify every navigation target
  exists as an `.mdx` file.
- Public only: no internal runbooks, server access, secrets, operator-only MCP
  details or private customer data.
- Use lowercase `kombify` unless quoting a proper name or code identifier; keep
  product names and public URLs consistent with current standards.
- Link standards instead of copying them; implementation-specific docs stay in
  the owning product repository.
- Client setup guides for non-technical readers follow
  `docs-guidelines/client-setup-guides.md` (component
  `snippets/client-setup-guide.jsx`, screenshots from
  `scripts/guide-screenshots/`).

## Verification

Run `mise run check` for config and path validation, and `mise run local:e2e`
before claiming the docs are ready to publish.

<!-- BEGIN GENERATED: beads-cloudflare-access -->
## Cloudflare Beads access

This repository carries its non-secret tracker binding in
`.kombify/beads-cloudflare.json`. On every new host/clone, run
`node scripts/beads-cloudflare-access.mjs` and require
`BEADS_CLOUDFLARE_ACCESS_OK`. The governed writer resolves this access
automatically from the host's GitHub identity; do not request or copy a
Cloudflare key. Trusted CI uses its configured GitHub OIDC identity.
Cloudflare is the operational authority only for an explicitly activated
binding (`authority: cloudflare`). Bootstrap selects its native backend and
preserves local Dolt metadata for read-only comparison. Projection preserves
existing authority and defaults new bindings inactive; it never activates a
repository. Use the governed `beads:write` path and require independent
remote readback; never fall back to Dolt or replay an uncertain mutation.
Setup and recovery: the workspace `BEADS-REMOTE-WRITE-STANDARD.md` section
"Repository-bound Cloudflare access". Regenerate this block and its repository
files with `scripts/repo-context-sync.mjs --repo mintlify-docs --beads-only`.
<!-- END GENERATED: beads-cloudflare-access -->
