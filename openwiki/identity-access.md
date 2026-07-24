---
type: Architecture Documentation Map
title: Identity and Access documentation map
description: Guide to the published kombify identity, authorization, entitlement, and trust documentation, including its audience layers and enforcement caveats.
resource: identity/architecture.mdx
tags: [identity, authorization, entitlements, security, public-documentation]
---

# Identity and Access documentation map

> **Generated against:** `fc905e821407cc6f74f0252d7724a9a4dcd7cf81`

## Purpose and audience layers

Identity & Access is a dedicated public navigation tab with three MDX pages. They are intentionally layered rather than interchangeable:

| Page | Primary audience | Role |
| --- | --- | --- |
| `identity/overview.mdx` | General readers | Plain-language explanation of sign-in, plan-linked access, and agent delegation. |
| `identity/architecture.mdx` | Engineers and integrators | Technical architecture, principal types, flows, authorization gates, and rollout model. |
| `identity/trust-and-security.mdx` | Stakeholders, partners, and investors | Why identity/entitlements matter, the security posture, and high-level maturity framing. |

The overview links readers to architecture and trust/security; architecture and trust/security link back to the appropriate audience-specific material. These pages **are exposed by** the [Mintlify site and publication model](site-publication.md), which maps them directly in `docs.json`.

## Published technical model

The technical architecture describes these building blocks:

- Auth0 for authentication and signed JWT issuance.
- A Cloudflare edge gateway as the external entry point and always-on outer authorization gate.
- Auth0 FGA for fine-grained relationship checks for MCP-tool and agent-runtime operations.
- Stripe and RevenueCat as entitlement/billing sources; OpenFeature abstraction for capability flags.

Every external request enters through the edge. Origins trust a signed edge envelope created after edge checks, rather than inbound caller-supplied identity headers. Unknown routes deny by default. The published model requires an organization identity (`org_id`) for every principal.

### Two authorization gates

The architecture distinguishes defense-in-depth layers:

1. **Outer gate:** verifies token properties and evaluates organization, scope, tier, entitlement, signed capability flags, quota, and rate limits for every request.
2. **Inner gate:** applies FGA `Check` / `CheckObo` to MCP tools and agent runtime. Delegated decisions are the intersection of the user’s and agent class’s rights, never a union.

The same architecture says AI inference and knowledge/RAG routes are intentionally outside the inner FGA layer but remain outer-gated by tier, entitlement, and quota. Do not generalize this boundary into claims about unlisted endpoints or live enforcement state.

## Published user and entitlement flow

The technical page describes interactive login as OIDC authorization code flow with PKCE through hosted login, server-side token brokering, and a token sent to the edge. It describes an entitlement broker/orchestrator that propagates subscription changes to metadata, feature targeting, quota, and FGA tuples, thereby feeding discovery, execution, and usage gates.

The plain-language overview translates this to “sign in once, carry an expiring signed badge, and each door checks it,” including the important claim that an AI agent acting for a user does not receive more authority than that user.

This public architecture **shares an access-control subject with** [StackKits documentation map](stackkits.md): StackKits Node Hub guidance uses TinyAuth and PocketID for post-rollout onboarding. That StackKits-specific local flow is documented separately; do not infer that it is the same implementation as every component named in this broader platform architecture.

## Enforcement and maturity language

The technical source says enforcement is staged and reversible: build → keystones → shadow parity → enforce. Shadow decisions are audited, and promotion requires zero false denials over real principals. It intentionally does not disclose live per-domain enforcement state.

The stakeholder page frames authentication as live/enforcing and authorization/entitlements as provisioned but in staged rollout. Preserve that distinction. The repository-level `STATUS.md` describes documentation-site maturity, not a substitute for security-control evidence.

For dated product and maturity context, consult [content operations](content-operations.md#changelog-and-maturity-context) and the source changelog. Do not overwrite the architecture’s explicit caveat about unpublished live gate status with a changelog interpretation.

## Change guidance

- **Plain-language changes:** preserve the distinction among customer, staff, and AI-agent actors in `identity/overview.mdx`; route technical detail to architecture.
- **Technical changes:** start with `identity/architecture.mdx`; validate that provider, endpoint, token, or enforcement claims are source-backed and do not disclose internal status intentionally omitted by the public page.
- **Stakeholder/maturity changes:** start with `identity/trust-and-security.mdx`; keep it aligned with the technical model and current, verified maturity statements.
- **Navigation changes:** update `docs.json` and run the site checks described in [site and publication model](site-publication.md#local-checks).

## Related concepts

- [Site and publication model](site-publication.md) — public navigation and local validation for this MDX section.
- [Content operations](content-operations.md) — release/maturity context and repository change workflows.
- [StackKits documentation map](stackkits.md) — StackKits-specific onboarding references that touch identity concepts.
- [OpenWiki quickstart](quickstart.md) — source authority and repository constraints.
