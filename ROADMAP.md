---
title: mintlify-docs Roadmap
last_verified: 2026-08-11
roadmap_standard: kombify-roadmap@v1
track: v0-public-truth
---

# mintlify-docs Roadmap

## Current Focus

- **Target:** v0.2.0 - Released Public Truth
- **Outcome:** `docs.kombify.io` contains only the released StackKits surface
  and its minimal identity context.
- **Exit gate:** Local checks, exact-source deployment proof, and the live
  route/projection matrix pass with all retired pages absent.
- **Blocking bugs:** Beads label `blocks:v0.2.0`.

## Milestones

| Version | Stage | State | Outcome |
| --- | --- | --- | --- |
| v0.1.0 | Mintlify Starter | done | Initial Mintlify site and StackKits navigation. |
| v0.2.0 | Released Public Truth | current | Legacy imports are removed and release-backed positive scope is enforced. |
| v0.3.0 | StackKits Content Quality | planned | Remaining pages are continuously checked against public releases. |

## v0.2.0 - Released Public Truth

**Scope**

- [x] Reduce navigation to Start, StackKits, and Identity & Access.
- [x] Remove standalone Simulate, Proxmox, unpublished product, comparison,
  generic platform, and internal-development content.
- [x] Replace denylist-only checks with a positive publication scope.
- [x] Require exact-source Mintlify deployment evidence before live smoke.
- [x] Verify all remaining StackKits pages against public release `v0.16.0`.
- [x] Pass local policy, validation, and HTTP gates.
- [ ] Merge and prove the exact deployed commit at `docs.kombify.io`.

**Exit gate**

- [x] `mise run check` passes.
- [x] `mise run local:e2e` passes.
- [ ] Exact-source deployment wait passes for the merged full commit SHA.
- [ ] `mise run remote:public-safety` passes.
- [ ] No open P0/P1 Beads bugs with `blocks:v0.2.0`.

## v0.3.0 - StackKits Content Quality

**Scope**

- [ ] Re-audit StackKits pages on every public release.
- [ ] Keep commands, kit/module availability, and lifecycle wording aligned to
  immutable public artifacts.
- [ ] Prevent generated preview or draft pages from entering public navigation.

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
