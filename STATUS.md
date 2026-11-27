---
title: mintlify-docs Status
last_verified: 2026-11-26
maturity: alpha
---

# mintlify-docs Status

Cloud, AI Guide and Workbench, and Companion are published as the Apps tab
(`apps/`) in all six locales.

## Public surface

- Published at `docs.kombify.io` from this repository via Mintlify.
- Seven tabs (the `docs.json` navigation is the page inventory): Start,
  StackKits (largest; CLI reference generated), Homelab, SpeechKit, Apps,
  Identity & Access, Changelog.
- StackKits: Get started, six use-case guides (Photos, Files, Passwords, Media,
  Personal AI, Development) each nesting the applications that provide them,
  Guides, Platform services, Reference. Use-case, OS-compatibility and
  application-delivery pages come from a strict release-manifest consumer
  (published release assets only, matching schema, tag, source SHAs, digests and
  release URL; internal gate fields and positive OS rows without public receipt
  evidence are rejected). A repository dispatch and a weekly reconciliation open a
  generated-only PR; a release missing either asset shows `DocsSyncPending`.
- Homelab: product and operating boundary including the public, unsigned
  Windows Beta (`homelab/install-windows`, `homelab/availability`); no
  general-availability claim.
- SpeechKit: generated release block and `releases/latest` download links.
- Identity: one concise concept page plus the generated Gateway API reference,
  bound to a published Gateway release; no internal architecture or runbooks.
- No dependency on the retired legacy documentation repository.

## Safety and delivery

- `public-safety-policy.json` is a positive page-scope allowlist; every MDX
  page must be in the approved scope and in `docs.json`.
- Simulate-as-product, Proxmox, excluded products, internal paths, secret
  material and restricted-content markers fail closed.
- Local E2E (pinned Mintlify `4.2.684`) checks every navigation page and every
  forbidden route over real HTTP; remote checks verify removed direct routes,
  `llms.txt` and sitemap projections after deployment.
- Release-truth gate: the `stackkit.cc` website, installer endpoints, commands
  bound to the synced release snapshot, local-domain wording, and one-line
  installers never perform Apply; a bounded external-link gate covers website,
  installer and immutable release destinations.
- Example relevance: executable and structured blocks only on pages with a
  topic-specific workflow or configuration.
- Promotion waits for a successful Mintlify deployment bound to the exact full
  source commit before the live smoke counts.

## Verified dependencies

| Dependency | State |
| --- | --- |
| StackKits | Docs snapshot `v0.58.0` (`data/stackkits/latest.json`); newer releases arrive through the generated-only sync PR. |
| Homelab | Public unsigned Windows Beta; API and CLI reference synced from release `v0.49.2` (source `2614eaba28d8`); `homelab/availability` states the current public boundary. |
| SpeechKit | Docs snapshot `v0.80.16` (`data/speechkit/latest.json`). |
| Mintlify CLI / Node | `mint@4.2.684` / Node 24 through `mise`. |
| Hosting / analytics | Mintlify at `docs.kombify.io`; repository configuration disables telemetry and page-feedback collection. PostHog and session recording are not configured. Anonymous hosted verification on 2026-11-26 found no PostHog or other analytics vendor script in the delivered configuration, the delivered Mintlify analytics feature variants disabled, and no session recording on the sampled pages; `mise run remote:public-safety` passed against the live surface. This is bounded runtime evidence, not a full privacy or accessibility certification. |

## Known issues

- The Homelab Windows installer is an unsigned Beta (SmartScreen warning;
  verify the published checksums).
- Additional products stay excluded until an explicit public decision and an
  evidence-backed content audit expand the allowlist.
- The English StackKits CLI reference renders command pages that the translated
  trees do not carry yet; a missing locale counterpart is pending translation,
  not a publication failure.
- The generated Gateway API reference projects Gateway release `v0.68.5`, the
  newest published Gateway release. That contract predates the product rename,
  so the projection keeps the published service naming until a Gateway release
  after the rename is published.

## Verification

`mise run check` (policy, navigation, content, links), `mise run local:e2e` (local
Mintlify runtime), `mise run remote:public-safety` (deployed surface).
