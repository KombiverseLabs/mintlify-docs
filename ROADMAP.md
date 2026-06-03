---
title: mintlify-docs Roadmap
last_verified: 2026-06-03
roadmap_standard: kombify-roadmap@v1
track: v0-expansion
---

# mintlify-docs Roadmap

## Current Focus

- **Target:** v0.2.0 - Public Docs Baseline
- **Outcome:** The Mintlify repo has correct root metadata, navigation validation, and public-doc boundaries for the current StackKits-focused surface.
- **Exit gate:** Standards report no longer flags missing root files or missing local docs gate for this repo.
- **Blocking bugs:** Beads label `blocks:v0.2.0`

## Expansion Track

| Version | Stage | State | Outcome |
|---|---|---|---|
| v0.1.0 | Mintlify Starter | done | Mintlify site scaffold and StackKits navigation exist. |
| v0.2.0 | Public Docs Baseline | current | Root metadata, local validation, and public-doc boundaries are in place. |
| v0.3.0 | StackKits Content Quality | planned | StackKits guides are checked for accuracy, naming, and link health. |
| v0.4.0 | Product Coverage Expansion | planned | Additional kombify product docs are added only from verified product repo sources. |
| v0.5.0 | API Reference Integration | planned | Public API references are generated or imported from approved OpenAPI sources. |

## v0.2.0 - Public Docs Baseline

**Scope**

- [ ] Maintain `README.md`, `STATUS.md`, `ROADMAP.md`, `AGENTS.md`, `CLAUDE.md`, and `mise.toml`.
- [ ] Keep `docs.json` as the navigation source of truth.
- [ ] Add a local docs gate that validates navigation targets.
- [ ] Keep internal standards and implementation detail out of public MDX pages.

**Exit gate**

- [ ] `mise run check` passes.
- [ ] `mise run local:e2e` passes or records the external Mintlify CLI blocker.
- [ ] No open P0/P1 Beads bugs with `blocks:v0.2.0`.

## v0.3.0 - StackKits Content Quality

**Scope**

- [ ] Verify every StackKits page against the current `kombify-StackKits` repo.
- [ ] Remove starter copy or placeholder prose from active docs.
- [ ] Confirm service guide links and examples.
- [ ] Keep brand naming consistent.

**Exit gate**

- [ ] StackKits content has source-repo references or explicit verification notes.
- [ ] Navigation page targets remain valid.

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
