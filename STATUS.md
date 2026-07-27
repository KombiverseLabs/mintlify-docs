---
title: mintlify-docs Status
last_verified: 2026-07-19
maturity: alpha
---

# mintlify-docs Status

Current implementation state only. Future scope belongs in `ROADMAP.md`.

## Features

- Mintlify documentation site configured by `docs.json`.
- Public landing page at `index.mdx`.
- StackKits overview, quickstart, kit, service, explanation, and reference sections.
- Identity & Access tab with `identity/overview`, `identity/architecture`, and `identity/trust-and-security`.
- Changelog tab with `changelog/overview`.
- Site branding, favicon, logo, search prompt, navbar, contextual actions, and footer configured in `docs.json`.
- `docs.json` is enforced as the complete public MDX allowlist; direct hidden and restricted pages fail closed.
- Public-safety policy scans high-risk internal content and verifies local links across every publishable page.
- Local E2E starts pinned Mintlify `4.2.684` and proves public and forbidden routes over HTTP.

## Deployment

| Surface | Current State |
|---|---|
| Public docs | Mintlify-hosted site configured from this repo. |
| Preview | Mintlify local preview through pinned `mint@4.2.684` via `mise run dev`. |

## Dependencies

- Mintlify `docs.json` schema.
- Node 24 for local CLI execution through `mise`.
- Pinned `mint@4.2.684` for local preview and provider-advisory link validation.
- `kombify-StackKits` as the verification source for all StackKits pages.
- The legacy kombify docs repository as the upstream extraction source.
- Mintlify hosting for `docs.kombify.io`; PostHog for page analytics via `docs.json`.

## Known Issues

- Product coverage is limited to StackKits, Identity & Access, and Changelog; other kombify products have no public pages yet.
- `mint broken-links` is a blocking part of the local gate; the earlier AGENTS.md-as-MDX provider issue is handled by `.mintignore` (PR #22).
- PR #15 remains blocked because its exact preview serves `/review/audience-workflow` anonymously. Restricted-future pages are incompatible with the current public-only documentation standard.

## Tests

- `mise run check` runs eight focused publication-boundary tests, validates all MDX against `docs.json`, scans forbidden content, and resolves local links.
- `mise run local:e2e` adds real HTTP checks against the pinned Mintlify preview.
- Exact-head CI checks forbidden direct routes plus `llms.txt` and sitemap projections before publication.
