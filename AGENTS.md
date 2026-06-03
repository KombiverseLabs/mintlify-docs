# AGENTS.md - mintlify-docs

Generic AI-agent instructions for Codex, Copilot, Gemini, Claude, and other coding agents.

## Normative Sources

Use workspace standards in `../kombify-Core/standards/`:

- `DOCS_STANDARDS.md` for Tier-1 public docs rules.
- `REPO-FILE-SCHEMA.md` for root metadata.
- `PROJECT-PLANNING-STANDARD.md` for Notion / Roadmap / Beads separation.
- `PRODUCT-SEGMENTATION.md` for product naming and public/internal boundaries.

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
