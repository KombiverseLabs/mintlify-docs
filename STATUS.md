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
- Identity is a single concise concept page; it does not expose internal
  architecture or security runbooks.
- No dependency on the retired legacy documentation repository.

## Safety And Delivery

- `public-safety-policy.json` is a positive page-scope allowlist.
- Every MDX page must be both in the approved scope and in `docs.json`.
- Simulate-as-product, Proxmox, unpublished products, internal paths, secret
  material, and restricted-content markers fail closed.
- Local E2E uses pinned Mintlify `4.2.684` and verifies allowed and forbidden
  routes through real HTTP.
- Remote safety checks verify removed direct routes, `llms.txt`, and sitemap
  projections after deployment.
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

- The reduced surface is not considered live until the cleanup commit has been
  merged, its exact Mintlify deployment has succeeded, and the remote route and
  projection matrix passes.
- Additional product documentation remains excluded until an explicit public
  release decision and evidence-backed content audit expands the allowlist.

## Verification

- `mise run check` validates policy, navigation, content, and local links.
- `mise run public-safety:test` proves representative forbidden content fails.
- `mise run local:e2e` exercises the local Mintlify runtime.
- `mise run remote:public-safety` exercises the deployed anonymous surface.
