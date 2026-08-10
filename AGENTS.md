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
- GitHub Projects is the canonical portfolio and roadmap planning system: high-level epics, cross-repo priorities, phase gates, ownership, and blockers. It is the single source of truth for what to build and when. Full taxonomy and workflow: `GITHUB-PROJECTS-PLANNING-STANDARD.md`. Migrated from Linear 2026-08-10; Linear stays reachable as a read-only historical archive, no new planning work there.
- Org: KombiverseLabs, private Projects 4 (Development) / 5 (kombify-AI) / 6 (Go-to-Market & Branding) / 7 (Personal), items stored as draft issues (not repo-linked GitHub Issues — several kombify repos are public). Every Development-project item carries exactly one `Area` value; detailed AI component tracking lives in the separate kombify-AI project via `Component`.
- Altitude discipline: only genuine cross-repo priorities/decisions/blockers belong in GitHub Projects — single-repo implementation epics stay Beads-only, even substantial ones.
- Repo-local `ROADMAP.md` and optional `docs/roadmap/v0.x.0-*.md` files remain the canonical repo milestone scope and release-gate documents.
- Beads is the canonical execution tracker inside each repo. Keep detailed tasks, subtasks, bugs, bugfixes, dependencies, and technical-depth follow-ups in Beads only.
- GitHub Projects and Beads are cross-referenced, not synced: a Project item may cite Beads IDs in its `Beads` field and a Beads issue may cite the origin in `external_ref`. Either can exist without the other.
- Check/update GitHub Projects at session boundaries (start and end), not on every Beads operation. Do not recreate one-way or bidirectional roadmap syncs between Beads, GitHub Projects, and repo docs beyond the sanctioned generated read view below.
- Sanctioned one-way read view (User-Decision 2026-06-10, see `STANDARDS_ENFORCEMENT.md`): `roadmap-open-issues` renders open Beads issues into the marked `## Open Issues` block inside ROADMAP.md — a derived view, never edit it manually, never sync back.
- **`roadmap-sync` (ROADMAP.md milestone → `roadmap:milestone` issue) is NOT YET migrated off Linear** — tracked in Beads `platform-o4ql1`. Until rebuilt, `mise run roadmap:update -- -Repo <repo> -Sync` still writes to Linear, not GitHub Projects. The plain (non-`-Sync`) form that refreshes the ROADMAP.md Open-Issues block is unaffected and stays canonical.
- Session close with milestone-relevant work: update the Scope/Exit-gate checkboxes in the touched repo's repo-local `ROADMAP.md`, then run `mise run roadmap:update -- -Repo <repo>` from the workspace root.
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
