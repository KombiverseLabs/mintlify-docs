# AGENTS.md - mintlify-docs

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
