---
title: mintlify-docs Status
last_verified: 2026-10-15
maturity: alpha
---

# mintlify-docs Status

Verified 2026-10-15: `mise run check` and `mise run remote:public-safety` pass
on `main`. Cloud, AI Guide and Workbench, and Companion pages exist only as
staged English sources in `drafts/apps/`; nothing of them is published.

## Public Surface

- StackKits use cases, OS compatibility, and application delivery now have
  dedicated public pages plus a strict release-manifest consumer. The consumer
  accepts only published release assets with matching schema, tag, private and
  public source SHAs, canonical digests, and public release URL; it rejects
  internal gate fields and positive OS rows without public receipt evidence.
  A repository-dispatch and weekly reconciliation opens a generated-only PR,
  while a release without both assets remains visibly `DocsSyncPending`.

- Mintlify site configured from this repository and published at
  `docs.kombify.io`.
- Six allowed navigation tabs: Start, StackKits, Techstack, SpeechKit,
  Identity & Access, and Changelog.
- StackKits content is limited to capabilities verified against the current
  public StackKits release.
- The navigation in `docs.json` is the page inventory; the StackKits tab is the
  largest (its CLI reference is generated), Techstack and SpeechKit are
  smaller, and Start, Identity & Access and Changelog are one page each.
- Techstack documents the current product and operating boundary, including the
  public, unsigned Windows Alpha (`techstack/install-windows`,
  `techstack/availability`). It makes no general-availability claim.
- SpeechKit documentation describes the current public release through a
  generated release block and `releases/latest` download links.
- The StackKits tab groups Get started, Use cases, Guides, Platform services,
  and Reference. Six use-case guides (Photos, Files, Passwords, Media,
  Personal AI, Development) each nest the applications that provide them; the
  CLI reference sits under Reference.
- Identity is a single concise concept page; it does not expose internal
  architecture or security runbooks.
- No dependency on the retired legacy documentation repository.

## Safety And Delivery

- `public-safety-policy.json` is a positive page-scope allowlist.
- Every MDX page must be both in the approved scope and in `docs.json`.
- Simulate-as-product, Proxmox, excluded products, internal paths, secret
  material, and restricted-content markers fail closed.
- Local E2E uses pinned Mintlify `4.2.684` and verifies every public page in the navigation plus
  every forbidden route through real HTTP.
- Remote safety checks verify removed direct routes, `llms.txt`, and sitemap
  projections after deployment.
- A focused release-truth gate pins the singular `stackkit.cc` website,
  installer endpoints, commands bound to the synced release snapshot, local-domain wording, and the
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
| StackKits | Docs snapshot `v0.53.4` (public source `a7e5f140eb3b7f4ebfcaaddc7d1ceb7da2d3d604`, `data/stackkits/latest.json`); newer public releases arrive through the generated-only sync pull request. |
| Techstack | Public unsigned Windows Alpha; API and CLI reference synced from release `v0.39.0`; see `techstack/availability` for the current published release. |
| SpeechKit | Docs snapshot `v0.75.7` (`data/speechkit/latest.json`). |
| Mintlify CLI | Pinned `mint@4.2.684` through `mise`. |
| Node | Version 24 through `mise`. |
| Hosting | Mintlify at `docs.kombify.io`. |
| Analytics | PostHog through `e.kombify.io`; session recording disabled. |

## Known Issues

- Carried from the v0.16.0 review and not re-verified against the `v0.53.4`
  snapshot: Cloud Kit is present in the release, but its public live-runtime
  evidence is pending; the docs make no production-readiness claim.
- Photos and Vault workload contracts validate and generate, but v0.16.0 has no
  safe public post-init command for adding their required owner-bound secret
  custody. Their pages remain descriptive rather than installation recipes.
- The Techstack Windows installer is an unsigned Alpha (SmartScreen warning;
  verify the published checksums). Techstack makes no general-availability
  claim, and its pages describe only what the published release does.
- Additional product documentation remains excluded until an explicit public
  decision and evidence-backed content audit expands the allowlist.

## Verification

- `mise run check` validates policy, navigation, content, and local links.
- `mise run public-safety:test` proves representative forbidden content fails.
- `mise run local:e2e` exercises the local Mintlify runtime.
- `mise run remote:public-safety` exercises the deployed anonymous surface.
