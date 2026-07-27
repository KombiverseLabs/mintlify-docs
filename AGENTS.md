# AGENTS.md - mintlify-docs

<!-- BEGIN GENERATED: planning-policy kombify-agent-policy-sync -->
> Generated from `AGENTS.md` in the kombify workspace root. Do not edit this
> block in child repos; update the root policy and run
> `mise run agents:planning:sync`.

## Planning System Policy

- The workspace root `AGENTS.md` `## Planning System Policy` section is the
  canonical source for generated planning-policy blocks in repo-local
  `AGENTS.md` files. Edit the workspace root policy first, then run
  `mise run agents:planning:sync`. Do not hand-edit the generated blocks in
  child repos.
- Linear is the canonical portfolio and roadmap planning system: high-level epics, cross-repo priorities, phase gates, ownership, and blockers. It is the single source of truth for what to build and when. Full taxonomy and workflow: `LINEAR-PLANNING-STANDARD.md`.
- Workspace: Kombiverse Labs (team KOM). Every Development-project issue carries exactly one `area:*` label; detailed AI component tracking lives in the separate kombify-AI project.
- Repo-local `ROADMAP.md` and optional `docs/roadmap/v0.x.0-*.md` files remain the canonical repo milestone scope and release-gate documents.
- Beads is the canonical execution tracker inside each repo. Keep detailed tasks, subtasks, bugs, bugfixes, dependencies, and technical-depth follow-ups in Beads only.
- Linear and Beads are cross-referenced, not synced: a Linear issue may cite Beads IDs and a Beads issue may cite a Linear ID. Either can exist without the other.
- Check/update Linear at session boundaries (start and end), not on every Beads operation. Do not recreate one-way or bidirectional roadmap syncs between Beads, Linear, and repo docs beyond the two sanctioned generated read views below.
- Sanctioned one-way read views (User-Decision 2026-06-10, see `STANDARDS_ENFORCEMENT.md`): (1) `roadmap-sync` mirrors each ROADMAP.md milestone into one Linear issue (`[<repo>] M<r> · v0.x.0 — <Name>`, label `roadmap:milestone`; the derived rank M1..M5 is the execution order of the active milestones); (2) `roadmap-open-issues` renders open Beads issues into the marked `## Open Issues` block inside ROADMAP.md. Both are derived views — never edit them manually, never sync back.
- Session close with milestone-relevant work: update the Scope/Exit-gate checkboxes in the touched repo's repo-local `ROADMAP.md`, then run `mise run roadmap:update -- -Repo <repo>` from the workspace root (refreshes the Open-Issues block; add `-Sync` to push the Linear mirror).
<!-- END GENERATED: planning-policy kombify-agent-policy-sync -->

Generic AI-agent instructions for Codex, Copilot, Gemini, Claude, and other coding agents.

## Normative Sources

Use workspace-root standards and `../kombify-Core/standards/`:

- `../DOCUMENTATION-STANDARD.md` (workspace root, binding) for the documentation tier model and Tier-1 public docs rules.
- `../kombify-Core/standards/REPO-FILE-SCHEMA.md` for root metadata.
- `../LINEAR-PLANNING-STANDARD.md` (workspace root) for Linear / Roadmap / Beads separation.
- `../PLATFORM-STRATEGY.md` (workspace root) for product naming and public/internal boundaries.
- Repo gates: `.github/workflows/public-safety.yml` (public allowlist enforcement) and `.github/workflows/parity-gate.yml` (generated-MDX frontmatter).

## Repo Context

This repo is the public Mintlify documentation surface for kombify. `docs.json` is the navigation source of truth. Pages are MDX files.

## Working Rules

- Register every new page in `docs.json`.
- Keep public docs public: no internal-only server access, secrets, operator-only MCP details, or private customer data.
- Use lowercase `kombify` for the brand unless quoting a proper name or code identifier.
- Do not duplicate Core standards; link to them when internal agents need context.
- Keep implementation-specific docs in the owning product repo, not here.
- Keep roadmap scope in `ROADMAP.md`; keep tasks and bug lists in the execution tracker.

## Verification

- Run `mise run check` for config/path validation.
- Run `mise run local:e2e` before claiming this docs repo is ready to publish.
- When changing navigation, verify every page target exists as an `.mdx` file.
