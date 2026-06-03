---
title: mintlify-docs Status
last_verified: 2026-06-03
maturity: alpha
---

# mintlify-docs Status

Current implementation state only. Future scope belongs in `ROADMAP.md`.

## Features

- Mintlify documentation site configured by `docs.json`.
- Public landing page at `index.mdx`.
- StackKits overview, quickstart, kit, service, explanation, and reference sections.
- Site branding, favicon, logo, search prompt, navbar, contextual actions, and footer configured in `docs.json`.

## Deployment

| Surface | Current State |
|---|---|
| Public docs | Mintlify-hosted site configured from this repo. |
| Preview | Mintlify local preview through `npx mint@latest dev` or `mise run dev`. |

## Dependencies

- Mintlify `docs.json` schema.
- Node 22 for local CLI execution through `mise`.
- `npx mint@latest` for local preview and broken-link validation.

## Known Issues

- This repo was still using the Mintlify starter README and starter AGENT instructions before the 2026-06-03 standards pass.
- Only StackKits content is currently represented in `docs.json`.
- No package-managed validation toolchain is committed yet; the local gate uses PowerShell plus `npx`.

## Tests

- `mise run check` validates `docs.json` and navigation page targets.
- `mise run local:e2e` runs the same local validation and attempts Mintlify broken-link validation through `npx`.
