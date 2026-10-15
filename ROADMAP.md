---
title: mintlify-docs Roadmap
last_verified: 2026-10-15
roadmap_standard: kombify-roadmap@v1
track: v0-expansion
---

# mintlify-docs Roadmap

## Current Focus

- **Target:** v0.7.0 - Apps Public Docs
- **Outcome:** `docs.kombify.io` documents Cloud, the AI Guide and Workbench, and
  Companion from reviewed English sources with a reviewed counterpart in every
  published locale, added through one explicit publication decision.
- **Exit gate:** The workspace publication scope and the Mintlify allowlist change
  together; `mise run check` and the live public-safety check pass; no page
  makes a claim the product sources do not state.
- **Blocking bugs:** Beads label `blocks:v0.7.0`

## Expansion Track

| Version | Stage | State | Central | Epic | Outcome |
|---|---|---|---|---|---|
| v0.1.0 | Mintlify Starter | done | C3 | `mintlify-docs-ffd` | Initial Mintlify site and StackKits navigation. |
| v0.2.0 | Released Public Truth | done | C3 | `mintlify-docs-hky` | Legacy imports are removed and release-backed positive scope is enforced. |
| v0.3.0 | StackKits Content Quality | done | C3 | `mintlify-docs-pd5` | Practical pages and focused release-truth checks stay aligned with public artifacts. |
| v0.4.0 | Techstack And SpeechKit Public Docs | done | C3 | `mintlify-docs-f8d` | Add both product areas without restoring legacy or unsupported claims. |
| v0.5.0 | kombify.me Public Docs | done | C3 | `mintlify-docs-a7u` | Live public HTTPS names and the optional private relay are documented without hosted LAN DNS claims; the pages answer 200 on `docs.kombify.io`. |
| v0.6.0 | Localized Release-Synced Docs | done | C3 | `mintlify-docs-pa6` | Six locales (en, de, es, zh-Hans, hi, ar) with a per-locale check; StackKits (snapshot v0.53.4), SpeechKit (v0.75.7) and the Techstack API and CLI reference (v0.39.0) sync from public release artifacts through generated-only pull requests. |
| v0.7.0 | Apps Public Docs | current | C5 | `mintlify-docs-w78` | Cloud, AI Guide and Workbench, and Companion pages are written in English and staged under `drafts/apps/`; publication waits for the publication decision, the allowlist change and localized counterparts. |
| v0.8.0 | Release-Synced Localization and Delivery Automation | planned | C3 | `mintlify-docs-d3v` | A new StackKits, SpeechKit or Techstack release reaches all six locales through generated-only pull requests with no manual translation, and the Mintlify delivery read token and legacy project cleanup are finished. |
| v0.9.0 | Docs Consolidation and StackKits Catalog Completeness | planned | C3 | `mintlify-docs-dxk` | All product documentation lives in mintlify-docs with no docs/ remnants in product repositories, and every StackKits catalog application the public release ships is documented. |
| v0.10.0 | Public API and MCP Reference | planned | C6 | `mintlify-docs-9d3` | The public Gateway API and the customer MCP endpoint have generated, release-backed reference pages in every locale, and the identity and entitlement concepts match the shipped Auth0 and Gateway behavior. |
| v0.11.0 | Install and Upgrade Paths for Every Published Product | planned | C5 | `mintlify-docs-07w` | Each published product has release-backed install, upgrade and rollback pages and no page claims more than the published release does. |
| v0.12.0 | Public Beta Docs Gate | planned | C7 | `mintlify-docs-otl` | Privacy and security overviews match the legal pages, public pages are accessible and mobile-ready, and docs analytics follow the privacy policy before the public beta gate. |

## v0.2.0 - Released Public Truth

**Central:** C3 · **Beads epic:** `mintlify-docs-hky`

**Scope**

- [x] Reduce navigation to Start, StackKits, and Identity & Access.
- [x] Remove standalone Simulate, Proxmox, unpublished product, comparison,
  generic platform, and internal-development content.
- [x] Replace denylist-only checks with a positive publication scope.
- [x] Require exact-source Mintlify deployment evidence before live smoke.
- [x] Verify all remaining StackKits pages against public release `v0.16.0`.
- [x] Pass local policy, validation, and HTTP gates.
- [x] Merge and prove the exact deployed commit at `docs.kombify.io`.

**Exit gate**

- [x] `mise run check` passes.
- [x] `mise run local:e2e` passes.
- [x] Exact-source deployment wait passes for the merged full commit SHA.
- [x] `mise run remote:public-safety` passes.
- [x] No open P0/P1 Beads bugs with `blocks:v0.2.0`.

## v0.3.0 - StackKits Content Quality

**Central:** C3 · **Beads epic:** `mintlify-docs-pd5`

**Scope**

- [x] Re-audit the current StackKits pages against public release v0.16.0.
- [x] Keep commands, kit/module availability, and lifecycle wording aligned to
  immutable public artifacts.
- [x] Add release-validated installer, StackSpec, lifecycle, backup, component,
  and use-case guidance.
- [x] Distinguish current native-v2 enablement from contracts merely present in
  the release archive.
- [x] Prevent generated preview or draft pages from entering public navigation.
- [x] Add a focused gate for installer URLs and known v0.16.0 truth boundaries.
- [x] Audit every public command example and reject unrelated lifecycle filler
  on component, monitoring, and concept pages.

**Exit gate**

- [x] `mise run check` passes for the expanded tree.
- [x] `mise run local:e2e` passes for the expanded tree.
- [x] Exact-source deployment wait passes for the merged full commit SHA.
- [x] `mise run remote:public-safety` passes.

## v0.4.0 - Techstack And SpeechKit Public Docs

**Central:** C3 · **Beads epic:** `mintlify-docs-f8d`

**Scope**

- [x] Add Techstack overview, operating-mode, and availability pages.
- [x] State clearly that no public Techstack installer or anonymous source
  distribution exists yet.
- [x] Add SpeechKit overview, Windows installation, modes, and Go framework
  pages against public release `v0.52.14`.
- [x] Expand the positive allowlist, navigation, route smoke, and release-truth
  gates for both products.

**Exit gate**

- [x] `mise run check` passes for the expanded tree.
- [x] `mise run local:e2e` passes for all public and forbidden routes.
- [x] Exact-source deployment wait passes for the merged full commit SHA.
- [x] `mise run remote:public-safety` passes.
- [x] No open P0/P1 Beads bugs with `blocks:v0.4.0`.

## v0.5.0 - kombify.me Public Docs

**Central:** C3 · **Beads epic:** `mintlify-docs-a7u`

**Scope**

- [x] Add kombify.me overview, public-address, and private-target pages.
- [x] Keep hosted LAN DNS unpublished as a working resolver.
- [x] Expand the positive allowlist, navigation, and route smoke for the
      Techstack subsection.
- [x] Update the workspace publication scope together with the allowlist.

**Exit gate**

- [x] `mise run check` passes for the expanded tree (PASS 2026-10-15).
- [x] `mise run local:e2e` and the exact-source deployment wait are the per-merge
  CI gates (`ci:async`, Delivery); they are not re-run for this roadmap.
- [x] `mise run remote:public-safety` passes (PASS 2026-10-15; the kombify.me
  overview, public-address and localized pages answer 200).
- [x] No open P0/P1 Beads bugs with `blocks:v0.5.0`.

## v0.6.0 - Localized Release-Synced Docs

**Central:** C3 · **Beads epic:** `mintlify-docs-pa6`

**Scope**

- [x] Publish the six locales as Mintlify language branches with a per-locale
  check (`scripts/i18n/check.mjs`).
- [x] Consume StackKits and SpeechKit release manifests through a strict
  generated-only sync, and generate the Techstack API and CLI reference from a
  published release.
- [x] Translate the generated StackKits CLI and Techstack references into all
  locales.
- [x] Carry the remaining automation items (re-translation without a manual step, drift banner) into v0.8.0 and v0.7.0.

**Exit gate**

- [x] `mise run check` passes for every locale.
- [x] No open P0/P1 Beads bugs with `blocks:v0.6.0`.

## v0.7.0 - Apps Public Docs

**Central:** C5 · **Beads epic:** `mintlify-docs-w78`

**Scope**

- [x] Stage English sources for Cloud, AI Guide and Workbench, and Companion in
  `drafts/apps/` (excluded from the public scan and the locale check).
- [ ] Record the publication decision that moves Cloud, Workbench and Companion
  into the public documentation scope and update the workspace publication
  scope and the allowlist together.
- [ ] Review the staged pages against live product behavior and add reviewed
  counterparts in every published locale.
- [ ] Add the client setup guides with searchable steps and own screenshots
  (`mintlify-docs-s4k`).
- [ ] Add the Trust and governance page (`mintlify-docs-aykol-6`).

**Exit gate**

- [ ] The staged pages are published, localized and listed in `docs.json`, and
  `mise run check` plus `mise run remote:public-safety` pass for the exact merged
  source.
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

- [ ] Migrate remaining docs/ content into mintlify-docs and retire the duplicates.
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

Additional products, APIs, comparisons, integrations, or architecture material
are not scheduled by default. Any expansion requires an explicit public-release
decision, an authoritative source, a content audit, and a deliberate allowlist
change. Repository existence or historical documentation is insufficient.

## V1 Definition

Committed at v1.0.0: a complete customer-oriented information architecture,
release-backed installation, upgrade and rollback paths for every published
product, generated API references for the public contracts, all six locales
(en, de, es, zh-Hans, hi, ar) reviewed, and exact-source local and live
verification of the full anonymous surface. Additional products enter only
through the Expansion Boundary.

## Later

Post-0.x milestones. Each is a Beads epic like the table above; nothing is planned outside a milestone.

| Version | Stage | State | Central | Epic | Outcome |
|---|---|---|---|---|---|
| **v1.0.0** | Complete Customer Documentation | planned | C8 | `mintlify-docs-6hw` | The full customer information architecture, release-backed install and upgrade paths, generated API references and exact-source local and live verification of the whole anonymous surface hold in all six locales. |
| **v1.1.0** | Additional Products and References | planned | C8 | `mintlify-docs-0j2` | Each additional product whose public artifact ships (Paperwork, Automations, Me, Sites, Simulate) is documented after an explicit publication decision, source audit and allowlist change. |

### v1.0.0 - Complete Customer Documentation

**State:** planned · **Central:** C8 · **Beads epic:** `mintlify-docs-6hw`

**Scope**

- [ ] Readiness review and exact-source verification of the full anonymous surface.

**Exit gate**

- [ ] Every V1 definition item has exact-source evidence.
- [ ] All six locales pass the per-locale check.

### v1.1.0 - Additional Products and References

**State:** planned · **Central:** C8 · **Beads epic:** `mintlify-docs-0j2`

**Scope**

- [ ] Decision-gated documentation for additional products.

**Exit gate**

- [ ] Each added product passes the public-safety allowlist and release-truth checks.

## Not Planned

- Restoring or migrating the retired legacy documentation tree.
- Publishing internal development infrastructure or operator runbooks.
- Generated roadmap synchronization from this document.

<!-- BEGIN GENERATED: open-issues kombify-roadmap-sync -->
## Open Issues

_Generated from Beads open statuses; milestone sections use
`milestone:*` / `blocks:*` labels, and unmapped Beads are listed separately — do not edit;
refresh via `mise run roadmap:update`. Source: `bd list`, 2026-10-15._

### M1 · v0.7.0 — Apps Public Docs (0 open)
- none

### Unmapped Beads (7 open)
- `mintlify-docs-s4k` Client setup guides: owner follow-ups on #238 (searchable steps, own Immich + Bitwarden screenshots) (P1, open)
- `mintlify-docs-aykol-6` docs.kombify.io: sync the pinned StackKits release or show a drift banner; add the Trust and governance page (P2, open)
- `mintlify-docs-cdtsq-6` Release-docs workflows must re-translate generated reference pages into all active locales (P2, open)
- `mintlify-docs-el87` Consolidate Mintlify docs: migrate docs/ to mintlify-docs/ (P2, open)
- `mintlify-docs-el87-19` StackKits catalog: document self-hosted login gateway and Authelia (P2, open)
- `mintlify-docs-tlw` Finish legacy Mintlify project cleanup after completed public-docs reset (P2, open)
- `mintlify-docs-zww` Provision Mintlify purpose-bound delivery read token (P2, open)

**Total open:** 7
<!-- END GENERATED: open-issues kombify-roadmap-sync -->
