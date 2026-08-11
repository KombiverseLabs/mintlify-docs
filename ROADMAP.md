---
title: mintlify-docs Roadmap
last_verified: 2026-08-11
roadmap_standard: kombify-roadmap@v1
track: v0-public-truth
---

# mintlify-docs Roadmap

## Current Focus

- **Target:** v0.3.0 - StackKits Content Quality
- **Outcome:** `docs.kombify.io` adds practical, release-backed StackKits
  installation, configuration, lifecycle, recovery, component, and use-case guidance.
- **Exit gate:** Local checks, exact-source deployment proof, and the live
  route/projection matrix pass for the expanded tree.
- **Blocking bugs:** Beads label `blocks:v0.3.0`.

## Expansion Track

| Version | Stage | State | Outcome |
| --- | --- | --- | --- |
| v0.1.0 | Mintlify Starter | done | Initial Mintlify site and StackKits navigation. |
| v0.2.0 | Released Public Truth | done | Legacy imports are removed and release-backed positive scope is enforced. |
| v0.3.0 | StackKits Content Quality | current | Practical pages and focused release-truth checks stay aligned with public artifacts. |

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

**Exit gate**

- [x] `mise run check` passes for the expanded tree.
- [x] `mise run local:e2e` passes for the expanded tree.
- [x] Exact-source deployment wait passes for the merged full commit SHA.
- [x] `mise run remote:public-safety` passes.

## Expansion Boundary

Additional products, APIs, comparisons, integrations, or architecture material
are not scheduled by default. Any expansion requires an explicit public-release
decision, an authoritative source, a content audit, and a deliberate allowlist
change. Repository existence or historical documentation is insufficient.

## Not Planned

- Restoring or migrating the retired legacy documentation tree.
- Publishing internal development infrastructure or operator runbooks.
- Treating Simulate as a standalone product.
- Generated roadmap synchronization from this document.
