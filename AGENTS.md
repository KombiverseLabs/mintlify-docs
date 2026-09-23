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
3. Add a test only for a regression, core invariant or sensitive boundary (auth, billing, migrations, provider control, signing).
4. Assert effects, never structure (error strings, counts, snapshots).
5. One behavior, max one test.
6. No coverage or test-count goals pre-1.0.
7. A test that breaks on a behavior-preserving refactor is fixed or deleted.
8. The running app is the feedback loop: a one-command hot-reload dev loop; affected tests under 2 minutes.
9. Delete skipped, dead and superseded tests and code in the slice that obsoletes them.
10. Claims follow evidence: implemented, merged, deployed and live differ; missing evidence is pending.
<!-- END GENERATED: elastic-development-throughput kombify-throughput-policy-sync -->

<!-- BEGIN GENERATED: planning-policy kombify-agent-policy-sync -->
> Generated from `AGENTS.md` in the kombify workspace root. Do not edit this
> block in child repos; update the root policy and run
> `mise run agents:planning:sync`.

## Planning System Policy

- GitHub Projects owns cross-repo priorities, `ROADMAP.md` milestones, Beads
  executable work.

## Beads Remote Write Policy

- The remote Dolt history is the tracker authority; `.beads/issues.jsonl` is a
  derived export, never a fallback.
- Mutate only through
  `mise --cd <workspace-root> run beads:write --repo <manifest-id> -- <bd args>`
  and require `BEADS_REMOTE_WRITE_OK`; after a publish failure run
  `beads:publish`, never the mutation again.
- Never enable `dolt.auto-push`, `no-push` or `no-git-ops`. Schema upgrades have
  one designated migrator; other clones run `beads:bootstrap`
  ([standard](https://github.com/KombiverseLabs/kombify-workspace/blob/main/BEADS-REMOTE-WRITE-STANDARD.md)).

## Git And Completion

- Track the task in Beads; branch from `origin/main` in your own worktree and
  stage only your paths.
- Run the affected gate, then commit, push, open a PR and squash-merge once it
  is mergeable and green; never park a mergeable PR. Commit as the GitHub
  identity your token acts as.
- A merge is not live: ship only through the `kombify-ship` skill
  (`kombify-workspace/.agents/skills/kombify-ship/SKILL.md`).
- Close Beads issues after the merge SHA exists; remove only your merged
  worktree with `git worktree remove`.
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

## Verification

Run `mise run check` for config and path validation, and `mise run local:e2e`
before claiming the docs are ready to publish.
