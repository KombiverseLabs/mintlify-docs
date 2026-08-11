---
title: mintlify-docs Roadmap
last_verified: 2026-08-11
roadmap_standard: kombify-roadmap@v1
track: v0-expansion
---

# mintlify-docs Roadmap

## Current Focus

- **Target:** v0.4.0 - Techstack And SpeechKit Public Docs
- **Outcome:** `docs.kombify.io` adds truthful Techstack preview guidance and
  release-backed SpeechKit installation, mode, and framework documentation.
- **Exit gate:** Local checks, exact-source deployment proof, and the live
  route/projection matrix pass for the expanded tree.
- **Blocking bugs:** Beads label `blocks:v0.4.0`

## Expansion Track

| Version | Stage | State | Outcome |
| --- | --- | --- | --- |
| v0.1.0 | Mintlify Starter | done | Initial Mintlify site and StackKits navigation. |
| v0.2.0 | Released Public Truth | done | Legacy imports are removed and release-backed positive scope is enforced. |
| v0.3.0 | StackKits Content Quality | done | Practical pages and focused release-truth checks stay aligned with public artifacts. |
| v0.4.0 | Techstack And SpeechKit Public Docs | current | Add both product areas without restoring legacy or unsupported claims. |

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
- Additional products and API references only after their public artifacts and
  support boundaries are available.

## Not Planned

- Restoring or migrating the retired legacy documentation tree.
- Publishing internal development infrastructure or operator runbooks.
- Treating Simulate as a standalone product.
- Generated roadmap synchronization from this document.

<!-- BEGIN GENERATED: open-issues kombify-roadmap-sync -->
## Open Issues

_Generated from Beads open statuses; milestone sections use
`milestone:*` / `blocks:*` labels, and unmapped Beads are listed separately — do not edit;
refresh via `mise run roadmap:update`. Source: `bd list`, 2026-08-11._

### M1 · v0.4.0 — Techstack And SpeechKit Public Docs (0 open)
- none

### Unmapped Beads (2 open)
- `mintlify-docs-tlw` Reset public Mintlify docs to released StackKits scope (P0, in_progress)
- `mintlify-docs-8et` Enforce fail-closed public-only Mintlify publication boundary (P1, in_progress)

**Total open:** 2
<!-- END GENERATED: open-issues kombify-roadmap-sync -->
