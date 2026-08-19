---
type: Documentation Architecture
title: Mintlify site and publication model
description: How this repository turns MDX content and docs.json navigation into the public Mintlify documentation surface, with checkout-backed local validation guidance.
resource: docs.json
tags: [mintlify, publication, docs-json, validation, public-documentation]
---

# Mintlify site and publication model

> **Generated against:** `fc905e821407cc6f74f0252d7724a9a4dcd7cf81`

## Content model

The repository stores public documentation as `.mdx` files. [`docs.json`](../docs.json) configures the Mintlify site and maps its navigation groups to page identifiers; `scripts/run-local-e2e.ps1` resolves each identifier as `<repository>/<identifier>.mdx`. That means a new public page needs both a valid MDX file and a matching navigation entry when it is intended to be part of the published navigation.

`README.md` calls `docs.json` the public-content allowlist and states that content not ready for anonymous readers should stay outside this repository. This site-delivery rule **publishes the documented product concepts in** [StackKits documentation map](stackkits.md) and [Identity & Access map](identity-access.md), but does not replace the product repositories as their implementation authority.

### Published navigation

| `docs.json` tab | Page family | Current role |
| --- | --- | --- |
| Guides | `index.mdx` | Public landing page and initial StackKits entry points. |
| Identity & Access | `identity/*.mdx` | Three audience layers: overview, technical architecture, and trust/security framing. |
| Changelog | `changelog/overview.mdx` | Dated public product updates. |
| StackKits | `stackkits/**` and `guides/stackkits/**` | Product overview, kits, user journeys, service guides, explanation, and reference material. |

The StackKits tab is broadest and includes kit pages, decision/rollout guides, use cases, per-service pages, and reference material. [StackKits documentation map](stackkits.md) explains how these pages fit together rather than duplicating the file list.

## Site configuration

`docs.json` contains the Mintlify schema reference, brand properties, visual configuration, navigation, logo/assets, navbar, contextual actions, and footer links. It also contains external destinations such as the dashboard and community links. Treat these as site configuration—not proof that a linked external service has a particular runtime capability.

The repository has no application package manifest. [`mise.toml`](../mise.toml) supplies Node 24 and the task interface for local preview and validation.

## Local checks

Use `mise.toml` as the task authority:

| Command | Current checkout-backed behavior |
| --- | --- |
| `mise run dev` | Runs `npx mint@latest dev` for a local Mintlify preview. |
| `mise run check` | Runs `scripts/run-local-e2e.ps1 -SkipMintCli`; checks parseable `docs.json`, navigation MDX targets, and configured logo/favicon assets. |
| `mise run local:e2e` | Runs the same script without the skip flag, then invokes `npx -y mint@latest broken-links`. |

`scripts/run-local-e2e.ps1` is intentionally small and deterministic: it reads `docs.json`, recursively gathers `pages` from navigation tabs/groups, fails for missing targets, confirms configured assets, and optionally runs the Mintlify CLI. It does not itself prove all policy claims described in the README.

> **Watch for documentation drift:** `README.md` and `STATUS.md` describe a pinned Mintlify version and broader public-safety/local-link gates, but the current `mise.toml` and script use `mint@latest` and only show navigation/asset checks plus optional Mintlify broken-link validation. Document current behavior from the checkout; raise discrepancies for reconciliation instead of silently asserting the broader behavior.

## Change workflow

1. Determine whether the content is anonymous-reader-safe and belongs in this repository (`README.md`).
2. Update or add MDX in the appropriate public domain.
3. Add or adjust its `docs.json` navigation reference if it should be navigable.
4. Run `mise run check`; run `mise run local:e2e` before publication as required by `README.md`.
5. If editing a generated StackKits service page, follow the distinct ownership controls in [content operations](content-operations.md#generated-stackkits-service-guides).

The validation process **is maintained through** [content operations](content-operations.md): scheduled refresh and pull-request workflows separate authored docs from generated service-guide refreshes.

## Where to investigate next

- For MDX content purpose and reader flow, use [StackKits documentation map](stackkits.md) or [Identity & Access map](identity-access.md).
- For changelog context, generated docs, and Git signals, use [content operations](content-operations.md).
- For repository scope, current state, and planned work, return to [OpenWiki quickstart](quickstart.md).
