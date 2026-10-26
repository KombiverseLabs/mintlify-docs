# AGENTS.md - mintlify-docs

Public Mintlify documentation for kombify (Tier 1). `docs.json` is the
navigation source of truth; pages are MDX files.

<!-- BEGIN GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->
> Generated from the canonical `## Kombify Development Standard` section in the workspace
> root `AGENTS.md`. Do not edit this block in a product repository; update
> the root policy and run `mise run agents:throughput:sync`.

## Kombify Development Standard

- Binding: workspace `CONSTITUTION.md` rules 12 to 16, with the detail in workspace `DEVELOPMENT-THROUGHPUT-STANDARD.md` ("Development feedback loop", "Testing", "Development-probe admission") and skill `kombify-development:kombify-fast-development`. Downloads and artifact delivery apply the absolute [Render download prohibition](https://github.com/KombiverseLabs/kombify-workspace/blob/main/CI-CD-PLATFORM-STANDARD.md#render-download-prohibition) while coding and at deployment admission, in every product and environment.
- Tests (owner decisions D-2026-10-21-18 and D-2026-10-21-19): end-to-end journeys with the shared test users against the running product are the proof that a change works. No new unit or in-process tests except inside the repository's declared sensitive boundaries (`auth`, `billing`, `crypto`, `migration`, `compiler`, with their paths in `.kombify/test-boundaries.json`); the test boundary guard inside the required check blocks any other growth, unit tests outside the boundaries are deleted now, and no check requires that a page or piece of content exists. A fixed bug gets a journey step, not a unit test.
<!-- END GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->

<!-- BEGIN GENERATED: planning-policy kombify-agent-policy-sync -->
> Generated from `AGENTS.md` in the kombify workspace root. Do not edit this
> block in child repos; update the root policy and run
> `mise run agents:planning:sync`.
>
> Run workspace scripts from the workspace root. For a consumer,
> `session-publish.mjs` takes `--repo <absolute-owning-checkout>` and paths
> relative to that checkout. References to Start mean the workspace `AGENTS.md`.

## Owner Rules

- Every session, on every host and in every project, reads the owner's cross-project rules (`standards/rules.md` in the private repository `Soulcreek/agent-home`) before its first action. The SessionStart hook prints them (`KOMBIFY_OWNER_RULES`); any other host runs `node scripts/kombify-bootstrap.mjs rules`. Only when that fails, follow this file and say once that the owner rules were not read.
- The workspace `CONSTITUTION.md` binds in every repository; its rule 1 decides every conflict between documents.

## Planning System Policy

- Beads epics own cross-repo priorities, milestones (labels `milestone` and `central:C<n>`), phase gates and blockers; the central `ROADMAP.md` states the phase order, each product `ROADMAP.md` its milestones, and Beads the executable work. GitHub Projects is read-only history (owner decision 2026-10-15). Detail: workspace `ISSUE-FLOW-STANDARD.md`.

## Beads Remote Write Policy

- Cloudflare is the operational Beads authority (owner decision 2026-10-08). Mutate only through `mise --cd <workspace-root> run beads:write --repo <manifest-id> -- <bd args>` and require `BEADS_REMOTE_WRITE_OK ... tracker=cloudflare`; never fall back to Dolt or replay an uncertain write. Detail: workspace `BEADS-REMOTE-WRITE-STANDARD.md`.

## Public Beta Drift Guard

- Name the slice before feature work, fail closed on a missing prerequisite, prove "supported" at the current pin, keep `main` green, record bundled binaries in `THIRD-PARTY-NOTICES.md` and keep the tracker current: workspace `DEVELOPMENT-THROUGHPUT-STANDARD.md` "Drift guard"; scheduled jobs and the workflows a session may dispatch: workspace `CI-CD-PLATFORM-STANDARD.md`.

## Git And Completion

- Work on the synced `main` and publish only your own paths or hunks with `node scripts/session-publish.mjs`; open the batch ready with auto-merge after one automated review; close Beads issues after the merge SHA exists and reconcile with `--after-merge`. Detail: workspace `DEVELOPMENT-THROUGHPUT-STANDARD.md` "Sessions, checkouts and publishing" and workspace `AUTONOMOUS-MERGE-STANDARD.md`.
- Stable ships only through the product's release train and a merge is not live: workspace skill `.agents/skills/kombify-ship/SKILL.md` and workspace `CI-CD-PLATFORM-STANDARD.md` §4.6. Users get only what the owner releases (D-2026-10-20-07, D-2026-10-22-09): a change the owner said to release is shipped at once with `mise run release:attended -- --go <ref>`, at most once per product and UTC day and a second time that day only with `--now`, a product a passed test window tested is released with `--go D-2026-10-26-12 --passed-window <id>` (D-2026-10-26-12), and any other change is reported as on Preview and waiting for the owner's go; a `RELEASE_BLOCKER` goes to the owner in the same turn (§4.6 "No silent wait"). Report committed, merged, deployed and live state separately, with evidence and any exact blocker.
<!-- END GENERATED: planning-policy kombify-agent-policy-sync -->

## Sources

- Workspace `DOCUMENTATION-STANDARD.md` (tier model, Tier-1 rules, Brand bind)
  and `PLATFORM-STRATEGY.md` (product naming, public/internal boundaries);
  its "Repository Documentation" section for root metadata.
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
Cloudflare key. Trusted CI uses its configured GitHub OIDC identity. Where a
proxy holds the GitHub identity (Claude cloud sessions), the script dispatches
this repository's `beads-session.yml` workflow and receives a 12-24 h
credential by itself; `bd` then works directly. When `bd` reports no
credential, rerun the script; never report Beads access as a blocker first.
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

<!-- BEGIN GENERATED: kombify-bootstrap -->
## Repository bootstrap

`scripts/kombify-bootstrap.mjs` (workspace `SECRETS-ACCESS-STANDARD.md`
§6c) sets up private Go modules, GitHub Packages, Agent Home and Doppler access.
`node scripts/kombify-bootstrap.mjs --install` obtains or refreshes the private
Agent Home source, preserves the selected agents, installs through its own
installer and runs doctor. For context only use `node scripts/kombify-bootstrap.mjs context`;
`context --check` reports the installed receipt without changing it. A fresh
profile may select its target with `--home` and agents with `--agents`.
Readiness is per capability; pending on-demand access is not verified access.
For the selected Codex staff host, run
`node scripts/kombify-bootstrap.mjs mcp --mcp-host codex --mcp-credential-source github-session --install`.
This explicit setup uses the admitted GitHub identity and existing session
issuer before native initialization. It preserves recognized connectors;
conflicting local or custom entries return a pending capability. Expired
sessions use the same explicit command for repair. Other hosts retain their
own installation and readiness requirements. Hooks never dispatch this
preparation or activate repositories.
Use `--require-go` when the selected task needs Go; other tasks keep working.
Run
a command with this repository's Doppler secrets as
`node scripts/kombify-bootstrap.mjs run -- <cmd>`. Tokens are fetched on
demand: a missing `NODE_AUTH_TOKEN` or `DOPPLER_TOKEN` is never a blocker.
Private `@kombiverselabs` packages are vendored under `vendor/npm/` (§6d),
so installs need no token in Claude, Codex, Cursor or anywhere else; after a
version change run
`node scripts/kombify-bootstrap.mjs packages -- node scripts/kombify-vendor-packages.mjs`
and `pnpm install`.
Multi-repository cloud sessions load no repository hooks, so run the
bootstrap yourself there.
<!-- END GENERATED: kombify-bootstrap -->
