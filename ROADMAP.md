---
title: mintlify-docs Roadmap
last_verified: 2026-10-21
roadmap_standard: kombify-roadmap@v1
track: v0-expansion
---

# mintlify-docs Roadmap

## Current Focus

- **Target:** v0.7.0 - Apps Public Docs
- **Outcome:** `docs.kombify.io` documents Cloud, the AI Guide and Workbench, and
  Companion in every published locale (the Apps tab is live).
- **Exit gate:** The workspace publication scope (`DOCUMENTATION-STANDARD.md`)
  lists the Apps tab the Mintlify allowlist already admits; `mise run check` and
  the live public-safety check pass; no page makes a claim the product sources
  do not state.
- **Blocking bugs:** Beads label `blocks:v0.7.0`

## Expansion Track

| Version | Stage | State | Central | Epic | Outcome |
|---|---|---|---|---|---|
| v0.1.0 | Mintlify Starter | done | C3 | `mintlify-docs-ffd` | Initial Mintlify site and StackKits navigation. |
| v0.2.0 | Released Public Truth | done | C3 | `mintlify-docs-hky` | Legacy imports are removed and release-backed positive scope is enforced. |
| v0.3.0 | StackKits Content Quality | done | C3 | `mintlify-docs-pd5` | Practical pages and focused release-truth checks stay aligned with public artifacts. |
| v0.4.0 | Techstack And SpeechKit Public Docs | done | C3 | `mintlify-docs-f8d` | Add both product areas without restoring legacy or unsupported claims. |
| v0.5.0 | kombify.me Public Docs | done | C3 | `mintlify-docs-a7u` | Live public HTTPS names and the optional private relay are documented without hosted LAN DNS claims; the pages answer 200 on `docs.kombify.io`. |
| v0.6.0 | Localized Release-Synced Docs | done | C3 | `mintlify-docs-pa6` | Six locales (en, de, es, zh-Hans, hi, ar) with a per-locale check; StackKits, SpeechKit and the Techstack API and CLI reference sync from public release artifacts through generated-only pull requests. |
| v0.7.0 | Apps Public Docs | current | C5 | `mintlify-docs-w78` | Cloud, AI Guide and Workbench, and Companion pages are published in all six locales; the workspace publication scope still has to list the Apps tab. |
| v0.8.0 | Release-Synced Localization and Delivery Automation | planned | C3 | `mintlify-docs-d3v` | A new StackKits, SpeechKit or Techstack release reaches all six locales through generated-only pull requests with no manual translation, and the Mintlify delivery read token and legacy project cleanup are finished. |
| v0.9.0 | Docs Consolidation and StackKits Catalog Completeness | planned | C3 | `mintlify-docs-dxk` | All public customer manuals live in mintlify-docs without competing public manuals in product repositories; developer documentation remains with its implementation, and every StackKits catalog application the public release ships is documented. |
| v0.10.0 | Public API and MCP Reference | planned | C6 | `mintlify-docs-9d3` | The public Gateway API and the customer MCP endpoint have generated, release-backed reference pages in every locale, and the identity and entitlement concepts match the shipped Auth0 and Gateway behavior. |
| v0.11.0 | Install and Upgrade Paths for Every Published Product | planned | C5 | `mintlify-docs-07w` | Each published product has release-backed install, upgrade and rollback pages and no page claims more than the published release does. |
| v0.12.0 | Public Beta Docs Gate | planned | C7 | `mintlify-docs-otl` | Privacy and security overviews match the legal pages, public pages are accessible and mobile-ready, and docs analytics follow the privacy policy before the public beta gate. |

## v0.7.0 - Apps Public Docs

**Central:** C5 · **Beads epic:** `mintlify-docs-w78`

**Scope**

- [x] Publish the Cloud, AI Guide and Workbench, and Companion pages in all six locales and admit the Apps tab in the allowlist (#333, #334).
- [ ] Update the Tier-1 publication scope in the workspace `DOCUMENTATION-STANDARD.md` to list the Apps tab.
- [x] Add the client setup guides with searchable steps (#397).
- [x] Add the Trust and governance page (#388).

**Exit gate**

- [x] The Apps pages are published, localized and listed in `docs.json`.
- [ ] `mise run check` plus `mise run remote:public-safety` pass for the exact merged
  source that updates the workspace publication scope.
- [ ] No open P0/P1 Beads bugs with `blocks:v0.7.0`.

## v0.8.0 - Release-Synced Localization and Delivery Automation

**State:** planned · **Central:** C3 · **Beads epic:** `mintlify-docs-d3v`

**Scope**

- [ ] Release-docs workflows re-translate generated reference pages into all active locales without a manual step.
- [ ] Provision the Mintlify purpose-bound delivery read token for exact-source deployment evidence.
- [ ] Finish the legacy Mintlify project cleanup after the public-docs reset.

**Exit gate**

- [ ] A new product release reaches every locale without manual translation work.
- [ ] Exact-source deployment wait uses the purpose-bound read token.
- [ ] No open P0/P1 Beads bugs labelled `blocks:v0.8.0`.

## v0.9.0 - Docs Consolidation and StackKits Catalog Completeness

**State:** planned · **Central:** C3 · **Beads epic:** `mintlify-docs-dxk`

**Scope**

- [ ] Consolidate public customer manuals in mintlify-docs and retire competing public manuals. Retain developer docs, ADRs, contracts and implementation runbooks in their owning repositories under DOCUMENTATION-STANDARD.md Tier 3.
- [ ] Document the self-hosted login gateway and Authelia, then the rest of the catalog as releases ship.
- [ ] Re-verify carried known issues against the current StackKits snapshot.

**Exit gate**

- [ ] No product repository keeps a second public documentation tree.
- [ ] Every catalog entry in the synced release has a page or an explicit exclusion.
- [ ] No open P0/P1 Beads bugs labelled `blocks:v0.9.0`.

## v0.10.0 - Public API and MCP Reference

**State:** planned · **Central:** C6 · **Beads epic:** `mintlify-docs-9d3`

**Scope**

- [ ] Generated Gateway API reference.
- [ ] Customer MCP documentation.
- [ ] Identity, entitlement and billing concepts that match shipped behavior.

**Exit gate**

- [ ] The generated references rebuild from a published contract in CI.
- [ ] Every page passes the public-safety allowlist and the locale check.
- [ ] No open P0/P1 Beads bugs labelled `blocks:v0.10.0`.

## v0.11.0 - Install and Upgrade Paths for Every Published Product

**State:** planned · **Central:** C5 · **Beads epic:** `mintlify-docs-07w`

**Scope**

- [ ] Install, upgrade and rollback per product.
- [ ] Platform pages for SpeechKit macOS and Android.
- [ ] Recipes for pages that are descriptive today.

**Exit gate**

- [ ] Every command on the pages is bound to the synced release snapshot.
- [ ] The release-truth gate covers each new page.
- [ ] No open P0/P1 Beads bugs labelled `blocks:v0.11.0`.

## v0.12.0 - Public Beta Docs Gate

**State:** planned · **Central:** C7 · **Beads epic:** `mintlify-docs-otl`

**Scope**

- [ ] Security and privacy overview.
- [ ] Accessibility and mobile checks.
- [ ] Analytics review.

**Exit gate**

- [ ] Legal review finds no inconsistent claim.
- [ ] The accessibility check passes for every locale.
- [ ] No open P0/P1 Beads bugs labelled `blocks:v0.12.0`.

## Expansion Boundary

Additional products, APIs, comparisons, integrations or architecture material
need an explicit public-release decision, an authoritative source, a content
audit and a deliberate allowlist change; repository existence or historical
documentation is not enough.

## V1 Definition

v1.0.0: complete customer information architecture, release-backed install,
upgrade and rollback paths for every published product, generated API
references for the public contracts, all six locales (en, de, es, zh-Hans, hi,
ar) reviewed, exact-source local and live verification of the full anonymous
surface. Additional products enter only through the Expansion Boundary.

## Later

Each is a Beads epic; nothing is planned outside a milestone. v1.0.0 scope: readiness review and exact-source verification of the full anonymous surface, all six locales passing the per-locale check. v1.1.0 scope: decision-gated documentation for additional products, each passing the allowlist and release-truth checks.

| Version | Stage | State | Central | Epic | Outcome |
|---|---|---|---|---|---|
| **v1.0.0** | Complete Customer Documentation | planned | C8 | `mintlify-docs-6hw` | The full customer information architecture, release-backed install and upgrade paths, generated API references and exact-source local and live verification of the whole anonymous surface hold in all six locales. |
| **v1.1.0** | Additional Products and References | planned | C8 | `mintlify-docs-0j2` | Each additional product whose public artifact ships (Paperwork, Automations, Me, Sites, Simulate) is documented after an explicit publication decision, source audit and allowlist change. |

## Not Planned

- Restoring or migrating the retired legacy documentation tree.
- Publishing internal development infrastructure or operator runbooks.
- Generated roadmap synchronization from this document.

<!-- BEGIN GENERATED: open-issues kombify-roadmap-sync -->
## Open Issues

_Generated from Beads open statuses; milestone sections use
`milestone:*` / `blocks:*` labels, and unmapped Beads are listed separately — do not edit;
refresh via `mise run roadmap:update`. Source: `bd list`, 2026-10-21._

### M1 · v0.7.0 — Apps Public Docs (0 open)
- none

### M2 · v0.8.0 — Release-Synced Localization and Delivery Automation (0 open)
- none

### M3 · v0.9.0 — Docs Consolidation and StackKits Catalog Completeness (0 open)
- none

### M4 · v0.10.0 — Public API and MCP Reference (0 open)
- none

### M5 · v0.11.0 — Install and Upgrade Paths for Every Published Product (0 open)
- none

### M6 · v0.12.0 — Public Beta Docs Gate (0 open)
- none

### Unmapped Beads (9 open)
- `mintlify-docs-07w` [mintlify-docs] v0.11.0 - Install and Upgrade Paths for Every Published Product (P1, open)
- `mintlify-docs-0j2` [mintlify-docs] v1.1.0 - Additional Products and References (P1, open)
- `mintlify-docs-6hw` [mintlify-docs] v1.0.0 - Complete Customer Documentation (P1, open)
- `mintlify-docs-9d3` [mintlify-docs] v0.10.0 - Public API and MCP Reference (P1, open)
- `mintlify-docs-d3v` [mintlify-docs] v0.8.0 - Release-Synced Localization and Delivery Automation (P1, open)
- `mintlify-docs-07w.1` Install, upgrade and rollback guides for each published product (P2, in_progress)
- `mintlify-docs-9d3.1` Generate the public Gateway API reference from the published OpenAPI contract (P2, in_progress)
- `mintlify-docs-9d3.2` Document the customer MCP endpoint and curated tool baseline (P2, in_progress)
- `mintlify-docs-tlw` Finish legacy Mintlify project cleanup after completed public-docs reset (P2, in_progress)

**Total open:** 9
<!-- END GENERATED: open-issues kombify-roadmap-sync -->
