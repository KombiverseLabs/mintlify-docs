---
title: mintlify-docs Roadmap
last_verified: 2026-11-26
roadmap_standard: kombify-roadmap@v1
track: v0-expansion
---

# mintlify-docs Roadmap

## Current Focus

- **Target:** v0.8.0 - Release-Synced Localization and Delivery Automation
- **Outcome:** A new StackKits, SpeechKit or Homelab release reaches every
  published locale through generated-only pull requests with no manual
  translation step, the Mintlify delivery read token carries the exact-source
  deployment evidence, and the remaining legacy Mintlify project cleanup is
  closed with direct evidence.
- **Exit gate:** The release-docs workflows re-translate generated reference
  pages in every published locale, the legacy Mintlify project cleanup is
  recorded, and no open P0/P1 Beads bug carries `blocks:v0.8.0`.
- **Blocking bugs:** Beads label `blocks:v0.8.0`

## Expansion Track

| Version | Stage | State | Central | Epic | Outcome |
|---|---|---|---|---|---|
| v0.1.0 | Mintlify Starter | done | C3 | `mintlify-docs-ffd` | Initial Mintlify site and StackKits navigation. |
| v0.2.0 | Released Public Truth | done | C3 | `mintlify-docs-hky` | Legacy imports are removed and release-backed positive scope is enforced. |
| v0.3.0 | StackKits Content Quality | done | C3 | `mintlify-docs-pd5` | Practical pages and focused release-truth checks stay aligned with public artifacts. |
| v0.4.0 | Homelab And SpeechKit Public Docs | done | C3 | `mintlify-docs-f8d` | Add both product areas without restoring legacy or unsupported claims. |
| v0.5.0 | kombify.me Public Docs | done | C3 | `mintlify-docs-a7u` | Live public HTTPS names and the optional private relay are documented without hosted LAN DNS claims; the pages answer 200 on `docs.kombify.io`. |
| v0.6.0 | Localized Release-Synced Docs | done | C3 | `mintlify-docs-pa6` | Six locales (en, de, es, zh-Hans, hi, ar) with a per-locale check; StackKits, SpeechKit and the Homelab API and CLI reference sync from public release artifacts through generated-only pull requests. |
| v0.7.0 | Apps Public Docs | done | C5 | `mintlify-docs-w78` | Cloud, AI Guide and Workbench, and Companion pages are published in all six locales; the workspace publication scope admits them through the reviewed allowlist. |
| v0.8.0 | Release-Synced Localization and Delivery Automation | current | C3 | `mintlify-docs-d3v` | A new StackKits, SpeechKit or Homelab release reaches every published locale through generated-only pull requests with no manual translation, and the Mintlify delivery read token and legacy project cleanup are finished. |
| v0.9.0 | Docs Consolidation and StackKits Catalog Completeness | done | C3 | `mintlify-docs-dxk` | All public customer manuals live in mintlify-docs without competing public manuals in product repositories; developer documentation remains with its implementation, and every StackKits catalog application the public release ships is documented. |
| v0.10.0 | Public API and MCP Reference | done | C6 | `mintlify-docs-9d3` | The public Gateway API and the customer MCP endpoint have generated, release-backed reference pages in every locale, and the identity and entitlement concepts match the shipped Auth0 and Gateway behavior. |
| v0.11.0 | Install and Upgrade Paths for Every Published Product | done | C5 | `mintlify-docs-07w` | Each published product has release-backed install, upgrade and rollback pages and no page claims more than the published release does. |
| v0.12.0 | Public Beta Docs Gate | done | C7 | `mintlify-docs-otl` | Privacy and security overviews match the legal pages, public pages are accessible and mobile-ready, and docs analytics follow the privacy policy before the public beta gate. |

## v0.7.0 - Apps Public Docs

Central: **C5** · Beads epic: `mintlify-docs-w78` · State: done

**Scope**

- [x] Publish the Cloud, AI Guide and Workbench, and Companion pages in all six locales and admit the Apps tab in the allowlist (#333, #334).
- [x] Keep the Tier-1 publication scope in the workspace `DOCUMENTATION-STANDARD.md` in step with the reviewed allowlist, which admits `apps/`.
- [x] Add the client setup guides with searchable steps (#397).
- [x] Add the Trust and governance page (#388).

**Exit gate**

- [x] The Apps pages are published, localized and listed in `docs.json`.
- [x] `mise run check` plus `mise run remote:public-safety` pass for the exact merged source that updates the workspace publication scope.
- [x] No open P0/P1 Beads bugs labelled `blocks:v0.7.0`.

## v0.8.0 - Release-Synced Localization and Delivery Automation

Central: **C3** · Beads epic: `mintlify-docs-d3v` · State: current

**Scope**

- [x] Release-docs workflows re-translate generated reference pages into all active locales without a manual step (`mintlify-docs-cdtsq-6`, `mintlify-docs-3h4`).
- [x] Provision the Mintlify purpose-bound delivery read token for exact-source deployment evidence (`mintlify-docs-zww`).
- [ ] Finish the legacy Mintlify project cleanup after the public-docs reset (`mintlify-docs-tlw`).

**Exit gate**

- [ ] Every published locale carries the counterparts of the current English CLI reference pages; the English reference renders more command pages than the translated trees hold, so a missing counterpart is still pending translation.
- [ ] Exact-source deployment wait uses the purpose-bound read token.
- [ ] The legacy Mintlify project cleanup is recorded with direct evidence.
- [ ] No open P0/P1 Beads bugs labelled `blocks:v0.8.0`.

## v0.9.0 - Docs Consolidation and StackKits Catalog Completeness

Central: **C3** · Beads epic: `mintlify-docs-dxk` · State: done

**Scope**

- [x] Consolidate public customer manuals in mintlify-docs and retire competing public manuals. Retain developer docs, ADRs, contracts and implementation runbooks in their owning repositories under DOCUMENTATION-STANDARD.md Tier 3.
- [x] Document the self-hosted login gateway and Authelia, then the rest of the catalog as releases ship.
- [x] Re-verify carried known issues against the current StackKits snapshot.

**Exit gate**

- [x] No product repository keeps a second public documentation tree.
- [x] Every catalog entry in the synced release has a page or an explicit exclusion.
- [x] No open P0/P1 Beads bugs labelled `blocks:v0.9.0`.

## v0.10.0 - Public API and MCP Reference

Central: **C6** · Beads epic: `mintlify-docs-9d3` · State: done

**Scope**

- [x] Generated Gateway API reference.
- [x] Customer MCP documentation.
- [x] Identity, entitlement and billing concepts that match shipped behavior.

**Exit gate**

- [x] The generated references rebuild from a published contract in CI.
- [x] Every page passes the public-safety allowlist and the locale check.
- [x] No open P0/P1 Beads bugs labelled `blocks:v0.10.0`.

## v0.11.0 - Install and Upgrade Paths for Every Published Product

Central: **C5** · Beads epic: `mintlify-docs-07w` · State: done

**Scope**

- [x] Install, upgrade and rollback per product.
- [x] Platform pages for SpeechKit macOS and Android.
- [x] Recipes for pages that are descriptive today.

**Exit gate**

- [x] Every command on the pages is bound to the synced release snapshot.
- [x] The release-truth gate covers each new page.
- [x] No open P0/P1 Beads bugs labelled `blocks:v0.11.0`.

## v0.12.0 - Public Beta Docs Gate

Central: **C7** · Beads epic: `mintlify-docs-otl` · State: done

**Scope**

- [x] Security and privacy overview.
- [x] Accessibility and mobile checks.
- [x] Analytics review.

**Exit gate**

- [x] Legal review finds no inconsistent claim.
- [x] The accessibility check passes for every locale.
- [x] No open P0/P1 Beads bugs labelled `blocks:v0.12.0`.

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
| **v1.1.0** | Additional Products and References | done | C8 | `mintlify-docs-0j2` | The additional-product decision is recorded and its scope folded into the v1.0.0 readiness review (`mintlify-docs-0j2.1`). |

## Not Planned

- Restoring or migrating the retired legacy documentation tree.
- Publishing internal development infrastructure or operator runbooks.
- Generated roadmap synchronization from this document.

<!-- BEGIN GENERATED: open-issues kombify-roadmap-sync -->
## Open Issues

_Generated from Beads open statuses; milestone sections use
`milestone:*` / `blocks:*` labels, and unmapped Beads are listed separately — do not edit;
refresh via `mise run roadmap:update`. Source: `bd list`, 2026-11-26._

### M1 · v0.8.0 — Release-Synced Localization and Delivery Automation (0 open)
- none

### Unmapped Beads (3 open)
- `mintlify-docs-6hw` [mintlify-docs] v1.0.0 - Complete Customer Documentation (P1, open)
- `mintlify-docs-d3v` [mintlify-docs] v0.8.0 - Release-Synced Localization and Delivery Automation (P1, open)
- `mintlify-docs-tlw` Finish legacy Mintlify project cleanup after completed public-docs reset (P2, open)

**Total open:** 3
<!-- END GENERATED: open-issues kombify-roadmap-sync -->
