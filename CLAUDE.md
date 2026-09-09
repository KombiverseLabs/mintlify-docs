# CLAUDE.md - mintlify-docs

Read [AGENTS.md](AGENTS.md) first. Its planning, remote tracker, public-safety
and verification rules also apply to Claude workflows.

## Repo-Specific Rules

- `docs.json` is the Mintlify navigation source of truth.
- This repo is Tier-1 public documentation only.
- Do not publish internal runbooks, secrets, private customer data, or operator-only MCP details.
- Keep product names and public URLs consistent with current Core standards and product repo status.
- Do not copy large standards sections into MDX pages.

## Verification

Run `mise run check` for config/path validation and `mise run local:e2e` for the docs-local gate.
