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

| Version | Stage | State | Outcome |
| --- | --- | --- | --- |
| v0.1.0 | Mintlify Starter | done | Initial Mintlify site and StackKits navigation. |
| v0.2.0 | Released Public Truth | done | Legacy imports are removed and release-backed positive scope is enforced. |
| v0.3.0 | StackKits Content Quality | done | Practical pages and focused release-truth checks stay aligned with public artifacts. |
| v0.4.0 | Techstack And SpeechKit Public Docs | done | Add both product areas without restoring legacy or unsupported claims. |
| v0.5.0 | kombify.me Public Docs | done | Live public HTTPS names and the optional private relay are documented without hosted LAN DNS claims; the pages answer 200 on `docs.kombify.io`. |
| v0.6.0 | Localized Release-Synced Docs | done | Six locales (en, de, es, zh-Hans, hi, ar) with a per-locale check; StackKits (snapshot v0.53.4), SpeechKit (v0.75.7) and the Techstack API and CLI reference (v0.39.0) sync from public release artifacts through generated-only pull requests. |
| v0.7.0 | Apps Public Docs | current | Cloud, AI Guide and Workbench, and Companion pages are written in English and staged under `drafts/apps/`; publication waits for the publication decision, the allowlist change and localized counterparts. |

## v0.2.0 - Released Public Truth

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

**Scope**

- [x] Publish the six locales as Mintlify language branches with a per-locale
  check (`scripts/i18n/check.mjs`).
- [x] Consume StackKits and SpeechKit release manifests through a strict
  generated-only sync, and generate the Techstack API and CLI reference from a
  published release.
- [x] Translate the generated StackKits CLI and Techstack references into all
  locales.
- [ ] Release-docs workflows re-translate generated reference pages into all
  active locales without a manual step (`mintlify-docs-cdtsq-6`).
- [ ] Sync the pinned StackKits release or show a drift banner
  (`mintlify-docs-aykol-6`).

**Exit gate**

- [x] `mise run check` passes for every locale.
- [ ] A new StackKits, SpeechKit or Techstack release reaches all locales
  without manual translation work.
- [ ] No open P0/P1 Beads bugs with `blocks:v0.6.0`.

## v0.7.0 - Apps Public Docs

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

## Expansion Boundary

Additional products, APIs, comparisons, integrations, or architecture material
are not scheduled by default. Any expansion requires an explicit public-release
decision, an authoritative source, a content audit, and a deliberate allowlist
change. Repository existence or historical documentation is insufficient.

## V1 Definition

Version 1 requires a complete customer-oriented information architecture,
release-backed installation and upgrade paths for every published product,
generated API references for public contracts, and exact-source local and live
verification of the full anonymous surface.

## Later

- Localized customer documentation after the English source and review workflow
  are stable.
- Additional products and API references as their public artifacts and support
  boundaries ship.

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
