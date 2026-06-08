# CLAUDE.md - mintlify-docs

Claude-specific instructions. Keep aligned with `AGENTS.md`.

## Normative Sources

Use workspace standards in `../kombify-Core/standards/`, especially `DOCS_STANDARDS.md`, `REPO-FILE-SCHEMA.md`, `PROJECT-PLANNING-STANDARD.md`, and `PRODUCT-SEGMENTATION.md`.

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
