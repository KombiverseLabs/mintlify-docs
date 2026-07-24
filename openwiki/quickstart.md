---
type: Documentation Guide
title: mintlify-docs OpenWiki quickstart
description: Agent-facing map of the mintlify-docs public Mintlify documentation repository, its authoritative sources, current domains, and update workflow.
tags: [openwiki, mintlify, public-documentation, navigation]
---

# mintlify-docs OpenWiki quickstart

> **Generated against:** `fc905e821407cc6f74f0252d7724a9a4dcd7cf81`  
> **Scope:** repository documentation map, not a product or policy source of truth.

## What this repository is

`mintlify-docs` is the canonical public documentation and API-reference surface for kombify. It contains committed MDX content, with Mintlify site configuration and navigation in `docs.json`, and is published as the public docs site. The repository is intentionally **not** the owner of product implementation, internal runbooks, or workspace standards; those stay with their owning repositories and workspace locations. Source: `README.md`.

This OpenWiki is generated navigation for humans and agents. In a conflict, regenerate it from the authoritative material rather than treating it as an override.

## Read authority in this order

1. [`README.md`](../README.md) — repository role, scope, local workflow, and publication boundary.
2. [`STATUS.md`](../STATUS.md) — current implementation state, known issues, and checks.
3. [`ROADMAP.md`](../ROADMAP.md) — planned work only; it is not evidence that a capability exists.
4. Workspace standards referenced by the README and the current checkout.

The repository charter at `openwiki/INSTRUCTIONS.md` provides the OpenWiki-specific constraints. In particular, avoid presenting preview, schema-only, or planned material as an implemented product capability.

## Current public surface

`docs.json` exposes four navigation tabs:

| Domain | What it covers | Start here |
| --- | --- | --- |
| Guides | Public landing page and entry points into the current product content. | `index.mdx` |
| StackKits | The largest domain: architecture blueprints, kit pages, rollout and decision guides, use cases, service guides, explanations, and references. | [StackKits documentation map](stackkits.md) |
| Identity & Access | Plain-language, engineering, and stakeholder explanations of the published identity and entitlement architecture. | [Identity & Access map](identity-access.md) |
| Changelog | Product-update history and maturity context for the public surface. | [Content operations](content-operations.md#changelog-and-maturity-context) |

The [site and publication model](site-publication.md) explains how `docs.json` turns these MDX paths into the public documentation surface. [Content operations](content-operations.md) explains how authors, generated content, and CI keep it current.

## Fast paths

- **Add or revise a public page:** read [site and publication model](site-publication.md) first; navigation entries and their MDX targets must agree.
- **Change StackKits content:** use [StackKits documentation map](stackkits.md) to identify the reader journey, current support caveats, and generated service-guide boundary.
- **Answer or update the published access model:** start at [Identity & Access map](identity-access.md), then use the audience-specific MDX source page.
- **Understand why an update exists or what changed recently:** review [content operations](content-operations.md), then `changelog/overview.mdx` and relevant Git history.
- **Run local documentation checks:** use the checkout-backed commands in [site and publication model](site-publication.md#local-checks); `mise.toml` is the task authority.

## Key boundaries to preserve

- **Public-only content:** `README.md` defines `docs.json` as the navigation and public-content allowlist. Do not add internal, restricted, operator, or credential-bearing material to public MDX.
- **Evidence before capability claims:** current status comes from `STATUS.md` and the checkout. Keep future scope in `ROADMAP.md`.
- **Generated service guides:** changes under `guides/stackkits/services/` have a distinct provenance model; see [content operations](content-operations.md#generated-stackkits-service-guides).
- **Maturity language:** StackKits source pages mix stable, beta, preview, schema-only, vision-only, and planned material. Use [StackKits documentation map](stackkits.md#support-and-freshness-caveats) to avoid flattening those distinctions.

## Update this wiki

The charter directs maintainers to refresh from the workspace root with `mise run openwiki:update mintlify-docs` after repository changes outside `openwiki/`. The repository also contains a scheduled workflow at `.github/workflows/openwiki-update.yml` that opens an OpenWiki update pull request.

When updating, use the current checkout as source of truth; retain the full checkout SHA in every generated Markdown page; and keep generated output under `openwiki/` only.

## Backlog

- **Public-safety implementation details** — `README.md` references `public-safety-policy.json` and a schema path, but neither is present in this checkout’s root listing. Deferred until checkout evidence is available or the README is reconciled.
- **Complete StackKits contract reconciliation** — `stackkits/overview.mdx`, `stackkits/reference/spec-format.mdx`, individual kit pages, and newer changelog entries disagree on versions, names, and some support states. This wiki records the inconsistency but does not choose an unverified contract.
- **Broader public product coverage** — `STATUS.md` says current public coverage is limited to StackKits, Identity & Access, and Changelog. Additional product documentation belongs here only after verified source material is added.
