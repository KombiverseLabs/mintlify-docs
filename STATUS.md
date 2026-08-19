---
title: mintlify-docs Status
last_verified: 2026-08-11
maturity: alpha
---

# mintlify-docs Status

## Public Surface

- Mintlify site configured from this repository and published at
  `docs.kombify.io`.
- Three allowed navigation tabs: Start, StackKits, and Identity & Access.
- StackKits content is limited to capabilities verified against the current
  public StackKits release.
- The publishable tree contains 38 pages, 36 of them in the StackKits tab,
  including release-backed installation paths, StackSpec examples, lifecycle
  and recovery how-tos, component boundaries, and four use-case guides.
- Identity is a single concise concept page; it does not expose internal
  architecture or security runbooks.
- No dependency on the retired legacy documentation repository.

## Safety And Delivery

- `public-safety-policy.json` is a positive page-scope allowlist.
- Every MDX page must be both in the approved scope and in `docs.json`.
- Simulate-as-product, Proxmox, unpublished products, internal paths, secret
  material, and restricted-content markers fail closed.
- Local E2E uses pinned Mintlify `4.2.684` and verifies all 38 public pages plus
  every forbidden route through real HTTP.
- Remote safety checks verify removed direct routes, `llms.txt`, and sitemap
  projections after deployment.
- A focused release-truth gate pins the singular `stackkit.cc` website,
  installer endpoints, exact v0.16.0 commands, local-domain wording, and the
  boundary that one-line installers never perform Apply. A bounded external
  link gate checks the website, installer, and immutable release destinations.
- Every public page is checked for example relevance. Executable and structured
  blocks are limited to pages with a topic-specific workflow or configuration;
  component and concept pages use prose when no supported example explains the
  topic.
- Promotion waits for a successful Mintlify deployment bound to the exact full
  source commit before the live smoke can satisfy delivery.

## Verified Dependencies

| Dependency | Verified State |
| --- | --- |
| StackKits | Public release `v0.16.0`, commit `22705dd4bbee9caaa7601bffb4769a7c40314490`. |
| Mintlify CLI | Pinned `mint@4.2.684` through `mise`. |
| Node | Version 24 through `mise`. |
| Hosting | Mintlify at `docs.kombify.io`. |
| Analytics | PostHog through `e.kombify.io`; session recording disabled. |

## Known Issues

- Cloud Kit is present in the release, but its public v0.16.0 live-runtime
  evidence is pending; the docs make no production-readiness claim.
- Photos and Vault workload contracts validate and generate, but v0.16.0 has no
  safe public post-init command for adding their required owner-bound secret
  custody. Their pages remain descriptive rather than installation recipes.
- Additional product documentation remains excluded until an explicit public
  release decision and evidence-backed content audit expands the allowlist.

## Verification

- `mise run check` validates policy, navigation, content, and local links.
- `mise run public-safety:test` proves representative forbidden content fails.
- `mise run local:e2e` exercises the local Mintlify runtime.
- `mise run remote:public-safety` exercises the deployed anonymous surface.
