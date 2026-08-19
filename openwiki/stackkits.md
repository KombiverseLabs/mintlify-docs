---
type: Product Documentation Map
title: StackKits documentation map
description: Agent-facing guide to StackKits concepts, documented rollout journeys, kit maturity boundaries, and the relationship between public guides, references, and generated service documentation.
resource: stackkits/overview.mdx
tags: [stackkits, infrastructure, cue, rollout, public-documentation]
---

# StackKits documentation map

> **Generated against:** `fc905e821407cc6f74f0252d7724a9a4dcd7cf81`

## Conceptual model

StackKits are documented as CUE-validated infrastructure blueprints. The source overview describes a resolution model built from an architecture pattern, a runtime context (`local`, `cloud`, or `pi`), and composable add-ons. CUE validates and resolves these inputs into deployment artifacts and setup evidence. Sources: `stackkits/overview.mdx`, `stackkits/explanations/cue-architecture.mdx`.

The public documentation separates this model into three layers:

- **Architecture patterns / kits** define service relationships and deployment shape.
- **Context and compute choices** affect defaults such as access, TLS, and resource-sensitive service selection.
- **Add-ons and service choices** extend a selected pattern with optional capabilities.

The reference catalog says explicit configuration wins over context, and context wins over compute tier. The CUE explanation says schema unification, defaults, and constraints are the validation mechanism. Those explanations **are published through** the [Mintlify site and publication model](site-publication.md), whose navigation determines what is publicly reachable.

## Reader journey

Use the source hierarchy by reader goal rather than treating every page as equally current:

1. **Understand or select a pattern** — `stackkits/overview.mdx` and `guides/stackkits/choosing-a-kit.mdx`.
2. **Choose the operating shape** — `guides/stackkits/local-vs-cloud-vs-hybrid.mdx`, sizing, install-only-vs-managed-cloud, existing-homelab, and HA-readiness guides.
3. **Turn intent into a draft** — `guides/stackkits/from-intent-to-stack-spec.mdx` captures goal, environment, management preference, node count, and use cases without over-deciding technical details.
4. **Deploy** — `stackkits/quickstart.mdx` introduces installer and CLI routes; `guides/stackkits/deploy-with-cli-or-techstack.mdx` compares Install Engine, direct CLI, and Techstack guidance.
5. **Operate** — `guides/stackkits/node-hub.mdx` describes the post-rollout Node Hub, first sign-in, first PocketID passkey, and links to enabled-service how-to pages.
6. **Follow an outcome lifecycle** — `guides/stackkits/use-cases/overview.mdx` frames use cases as decide → set up → live with it → protect → move or leave. The current catalog has the Family Photo Vault lifecycle only.

Techstack is described as a guided orchestration/control-plane layer: StackKits continues to own standards, defaults, add-ons, and validation, while Techstack evaluates intent/targets, exposes recommendation and job state, and performs post-rollout checks. This rollout relationship **depends on the delivery surface explained in** [site and publication model](site-publication.md), and the operational ownership of generated guides is described in [content operations](content-operations.md).

## Current kit and maturity boundaries

Do not collapse source maturity labels into one broad “supported” claim.

| Material | Checkout-backed current description | Source anchors |
| --- | --- | --- |
| Base Kit | Single-environment pattern; its page identifies Coolify as the beta-default app platform and Komodo as a supported beta alternative. | `stackkits/kits/base-kit.mdx` |
| Cloud Kit | Cloud/VPS profile sharing the Base Kit foundation, with public-domain/TLS differences and a single-server current release contract. | `stackkits/kits/cloud-kit.mdx` |
| Modern Homelab | Explicitly **schema-only** and “not yet functional”; its page directs production use to Base Kit. | `stackkits/kits/modern-homelab.mdx` |
| High Availability Kit | Explicitly **vision-only** and “not yet implemented”; its page directs production use to Base Kit. | `stackkits/kits/ha-kit.mdx` |

The latest changelog entries add newer product terminology and support claims, including stable Cloud Kit and Architecture v2 beta work, while older overview and selection pages still prioritize Base/Modern/HA categories. These documents conflict in naming and lifecycle framing; treat the changelog as dated context rather than silently selecting a single contract. Verify against the external `kombify-StackKits` repository before changing support language—`README.md` names it as the verification source for StackKits pages.

## Specification, artifacts, and services

- `stackkits/reference/spec-format.mdx` describes `stack-spec.yaml` (with `kombination.yaml` accepted as an alias) as a deployment contract and includes fields, node/service forms, environment-variable references, and `stackkit validate`.
- `stackkits/explanations/cue-architecture.mdx` explains the OS → platform → application layers and how CUE validates a selected spec.
- `stackkits/reference/tool-alternatives.mdx` groups Base Kit platform services and optional add-ons, and explains defaults/overrides.
- `stackkits/reference/monitoring.mdx` defines an OTLP-first collector baseline and optional `monitoring-core` fan-in/retention tier.
- Kit pages document generated artifacts such as `deploy/`, `.stackkit/platform.json`, and `.stackkit/state.yaml`; rollout guidance documents `deploy/apps.tf` for application resources.

Keep examples secret-free. The spec reference recommends environment-variable references instead of literal values, and the rollout guide requires references—not raw values—for app secrets.

## Support and freshness caveats

Several current source inconsistencies matter to maintainers:

- `stackkits/overview.mdx` shows a `version: "2.0"` example and a simpler top-level format, while `stackkits/reference/spec-format.mdx` calls version `"1.0"` current and documents a different required top-level shape.
- The overview and older choosing guide omit Cloud Kit from their primary recommendation cards, though `docs.json` includes `stackkits/kits/cloud-kit` and the Cloud Kit page exists.
- The service/add-on terminology varies: for example, overview/catalog references to `monitoring` differ from Base Kit and monitoring-reference references to `monitoring-core`.
- `tool-alternatives.mdx` presents Dokploy as selectable, while Base/Cloud Kit pages call it draft/non-beta.
- Changelog entries describe later Architecture v2, Basement/Cloud terminology, and HA-as-add-on evolution that is not consistently reflected in the navigation pages.

When updating, preserve source-specific qualifier language and raise material contradictions rather than normalizing them speculatively. [Content operations](content-operations.md#changelog-and-maturity-context) records why Git and changelog evidence are useful for that review.

## Maintenance map

| Change area | Start with | Check |
| --- | --- | --- |
| Product overview / kit selection | `stackkits/overview.mdx`, `guides/stackkits/choosing-a-kit.mdx`, newest relevant changelog entry | Ensure Cloud/Modern/HA status agrees with verified product evidence. |
| Installer, CLI, or Techstack rollout | `stackkits/quickstart.mdx`, `guides/stackkits/deploy-with-cli-or-techstack.mdx` | Preserve source distinction between direct execution and guided orchestration. |
| Spec or CUE explanation | `stackkits/reference/spec-format.mdx`, `stackkits/explanations/cue-architecture.mdx` | Reconcile examples against the source repository before treating them as canonical. |
| Service guide | `guides/stackkits/services/*.mdx` and its workflow | Check [generated ownership rules](content-operations.md#generated-stackkits-service-guides). |
| Use case | `guides/stackkits/use-cases/*.mdx` plus linked service guides | Maintain lifecycle language and avoid claiming unavailable use cases. |

## Related concepts

- [Site and publication model](site-publication.md) — how StackKits MDX paths become the public surface.
- [Content operations](content-operations.md) — generated-guide provenance, changelog history, and update workflows.
- [Identity & Access map](identity-access.md) — published platform access model; StackKits’ Node Hub documents a local TinyAuth/PocketID onboarding path but should not be used to infer equivalence with the broader platform architecture.
- [OpenWiki quickstart](quickstart.md) — authority ordering and repository-wide constraints.
