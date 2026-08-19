# CLAUDE.md - mintlify-docs

Claude-specific instructions. Keep aligned with `AGENTS.md`.

## Normative Sources

Use the workspace-root `DOCUMENTATION-STANDARD.md` (binding), `LINEAR-PLANNING-STANDARD.md`, and `PLATFORM-STRATEGY.md`, plus `../kombify-Core/standards/REPO-FILE-SCHEMA.md`.

## Repo-Specific Rules

- `docs.json` is the Mintlify navigation source of truth.
- This repo is Tier-1 public documentation only.
- Do not publish internal runbooks, secrets, private customer data, or operator-only MCP details.
- Keep product names and public URLs consistent with current Core standards and product repo status.
- Do not copy large standards sections into MDX pages.

## Verification

Run `mise run check` for config/path validation and `mise run local:e2e` for the docs-local gate.

## Linear (High-Level Planning)

This repo maps to Linear label `area:websites` in the **Development** project.
Check `list_issues --label area:websites` for active high-level tasks before
starting significant work. Create Linear issues for cross-repo decisions,
blockers, or feature-level planning. Granular execution stays in Beads.

Workspace: [Kombiverse Labs](https://linear.app/kombiverse-labs)
Standard: `LINEAR-PLANNING-STANDARD.md` in the kombify workspace root.


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
2. **Run quality gates** (if code changed) - Tests, linters, builds
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
