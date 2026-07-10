---
title: mintlify-docs Status
last_verified: 2026-07-10
maturity: alpha
---

# mintlify-docs Status

Current implementation state only. Future scope belongs in `ROADMAP.md`.

## Features

- Mintlify documentation site configured by `docs.json`.
- Public landing page at `index.mdx`.
- StackKits overview, quickstart, kit, service, explanation, and reference sections.
- Site branding, favicon, logo, search prompt, navbar, contextual actions, and footer configured in `docs.json`.
- Public and organization-member restricted navigation metadata with a fail-closed audience-boundary gate.
- Local validation covers anonymous runtime smoke for public and restricted routes.
- PR and `main` validation includes a remote anonymous leak gate tied to the
  exact deployed commit.

## Deployment

| Surface | Current State |
|---|---|
| Public docs | Mintlify-hosted site configured from this repo. |
| Preview | Mintlify `4.2.684` local preview runtime smoke for public and restricted routes. |

## Dependencies

- Mintlify `docs.json` schema.
- Node 24 for local CLI execution through `mise`.
- `npx mint@4.2.684` for local preview and broken-link validation.

## Known Issues

- This repo was still using the Mintlify starter README and starter AGENT instructions before the 2026-06-03 standards pass.
- Only StackKits content is currently represented in `docs.json`.
- No package-managed validation toolchain is committed yet; the local gate uses PowerShell plus `npx`.
- Mintlify dashboard partial-auth activation remains a provider-only blocker;
  local runtime smoke is complete, while the remote PR/deployed-main gate
  correctly stays red until provider enforcement is active for organization-member auth.

## Tests

- `mise run check` validates `docs.json` and navigation page targets.
- `mise run local:e2e` runs the same local validation and attempts Mintlify broken-link validation through `npx`.
