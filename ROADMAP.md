---
title: mintlify-docs Roadmap
last_verified: 2026-07-10
roadmap_standard: kombify-roadmap@v1
track: v0-public-authority
---

# mintlify-docs Roadmap

## Current Focus

- **Target:** v0.3.0 - Public Authority Consolidation
- **Outcome:** Mintlify docs become the single public authority for product
  hierarchy, operating modes, cloud/premium boundaries, and journey truth.
- **Exit gate:** Public IA and routes align with workspace canonical targets and
  local docs validation gates pass.
- **Blocking bugs:** Beads label `blocks:v0.3.0`

## Expansion Track

| Version | Stage | State | Outcome |
|---|---|---|---|
| v0.1.0 | Mintlify Starter | done | Mintlify site scaffold and StackKits navigation exist. |
| v0.2.0 | Public Docs Baseline | done | Root metadata, local validation, and public-doc boundaries are in place. |
| v0.3.0 | Public Authority Consolidation | current | Platform hierarchy, operating modes, AI/support boundaries, and reference journeys are canonicalized in Mintlify. |
| v0.4.0 | Product Coverage Expansion | planned | Additional kombify product docs are added from verified source repos only. |
| v0.5.0 | API Reference Integration | planned | Public API references are generated/imported from approved OpenAPI sources. |

## v0.3.0 - Public Authority Consolidation

**Scope**

- [ ] Keep Mintlify as the sole public authority for active product hierarchy
  and customer hosts.
- [ ] Keep `docs.json` as the navigation source of truth.
- [ ] Keep five reference journeys discoverable and aligned with release scope.
- [ ] Remove or redirect retired product/repo/route references from active docs.
- [ ] Preserve useful technical docs and historical release content with clear
  historical labeling.
- [ ] Keep internal standards and implementation detail out of public pages.

**Exit gate**

- [ ] `mise run check` passes.
- [ ] `mise run local:e2e` passes.
- [ ] No open P0/P1 Beads bugs with `blocks:v0.3.0`.

## V1 Definition

- **State:** Uncommitted.
- **Known prerequisites:** Stable validation, current StackKits docs, product coverage decision, and API reference source workflow.
- **Open questions:** Which product surfaces are public in this Mintlify repo versus the broader `docs` repo.

## Later

- **v0.4.0:** Expand public docs from verified product repo sources.
- **v0.5.0:** Wire approved OpenAPI sources into public API reference.

## Not Planned

- **Internal docs merge:** Core internal docs and operator runbooks stay outside public Mintlify docs.
- **Generated roadmap sync:** Execution details stay out of `ROADMAP.md`.
