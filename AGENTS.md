# AGENTS.md - mintlify-docs

<!-- BEGIN GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->
> Generated from the canonical `## Kombify Development Standard` section in the workspace
> root `AGENTS.md`. Do not edit this block in a product repository; update
> the root policy and run `mise run agents:throughput:sync`.

## Kombify Development Standard

1. Phase determines rigor: product SemVer below 1.0.0 selects `fast-pre-1.0` — the affected deterministic gate is the only synchronous gate, and broad suites are 1.0-promotion evidence, never development gates. Route implementation, bug fixing, test selection or cleanup, local live testing, and pre-1.0 merge or activation decisions through `$kombify-fast-development` from the internal `kombify-plugin`; repository rules may narrow it but never weaken it.
2. Test behavior at public boundaries (CLI contracts, HTTP/OpenAPI, CUE schemas, cross-repo fixtures); black-box tests are the default, and a white-box test needs a stated reason.
3. A new test needs one of three reasons — reproduced regression, stable core invariant, or registered sensitive boundary (auth, billing, migrations, provider control, signing) — otherwise none.
4. Never assert structure: no exact error strings, element or field counts, source-text greps, or internal snapshots; assert the effect. Golden files only for genuine external contracts.
5. One behavior, one test: no duplicated axes (backend twins, unit+integration twins, per-version copies); when two tests cover one behavior without distinct risk, delete one.
6. Coverage percentage and test count are never goals or gates pre-1.0; sensitive areas are protected by named behavior tests, not percentage floors.
7. A test that breaks on a behavior-preserving refactor is a defective test: fix or delete the test, never contort the code to keep it green.
8. The running app is the primary feedback surface: every product repo maintains a documented one-command hot-reload dev loop (edit to observable in seconds; Docker optional, never required), and the affected test slice stays below 2 minutes target, 5 minutes hard.
9. Delete, don't hoard: skipped, never-running, or superseded tests and dead code are removed in the same slice that obsoletes them; suite reduction runs as its own measured slice; git history is the archive.
10. Claims tier to evidence: implemented, locally verified, merged, deployed, live, and release-ready are distinct claims, and missing evidence is pending, never passed. Update only this root section, then run `mise run agents:throughput:sync`; generated repository copies must not be edited manually.
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
  view; never hand-edit or sync its generated block back. Do not run
  `roadmap:update -Sync`: it still writes to the Linear archive and is not a
  planning path. Ordinary `roadmap:update` remains valid.
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

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run the affected gate** (if code changed) - follow `-fast-development`; do not expand to broad suites by default
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
