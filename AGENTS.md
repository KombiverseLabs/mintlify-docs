# AGENTS.md - mintlify-docs

<!-- BEGIN GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->
> Generated from the canonical `## Kombify Development Standard` section in the workspace
> root `AGENTS.md`. Do not edit this block in a product repository; update
> the root policy and run `mise run agents:throughput:sync`.

## Kombify Development Standard

- For implementation, bug fixing, test selection or cleanup, local live testing, and pre-1.0 merge or activation decisions, use `$kombify-fast-development` from the internal `kombify-plugin`.
- Repository rules may add narrower product commands and sensitive-boundary checks but must not weaken or contradict that skill.
- Ordinary pre-1.0 work uses only the affected deterministic gate; stable 1.0+ promotion uses the detailed release standards.
- `DEVELOPMENT-THROUGHPUT-STANDARD.md` and `LOCAL-E2E-DEPLOYMENT-STANDARD.md` are on-demand references for orchestration, infrastructure, activation, and release work, not mandatory startup context for ordinary development.
- Update only this root router, then run `mise run agents:throughput:sync`; generated repository copies must not be edited manually.
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
