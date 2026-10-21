---
title: mintlify-docs Status
last_verified: 2026-10-21
maturity: alpha
---

# mintlify-docs Status

Cloud, AI Guide and Workbench, and Companion are published as the Apps tab
(`apps/`) in all six locales.

## Public surface

- Published at `docs.kombify.io` from this repository via Mintlify.
- Seven tabs (the `docs.json` navigation is the page inventory): Start,
  StackKits (largest; CLI reference generated), Techstack, SpeechKit, Apps,
  Identity & Access, Changelog.
- StackKits: Get started, six use-case guides (Photos, Files, Passwords, Media,
  Personal AI, Development) each nesting the applications that provide them,
  Guides, Platform services, Reference. Use-case, OS-compatibility and
  application-delivery pages come from a strict release-manifest consumer
  (published release assets only, matching schema, tag, source SHAs, digests and
  release URL; internal gate fields and positive OS rows without public receipt
  evidence are rejected). A repository dispatch and a weekly reconciliation open a
  generated-only PR; a release missing either asset shows `DocsSyncPending`.
- Techstack: product and operating boundary including the public, unsigned
  Windows Alpha (`techstack/install-windows`, `techstack/availability`); no
  general-availability claim.
- SpeechKit: generated release block and `releases/latest` download links.
- Identity: one concise concept page, no internal architecture or runbooks.
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
| StackKits | Docs snapshot `v0.54.3` (`data/stackkits/latest.json`); newer releases arrive through the generated-only sync PR. |
| Techstack | Public unsigned Windows Alpha; API and CLI reference synced from release `v0.41.15`; `techstack/availability` names the current release. |
| SpeechKit | Docs snapshot `v0.77.7` (`data/speechkit/latest.json`). |
| Mintlify CLI / Node | `mint@4.2.684` / Node 24 through `mise`. |
| Hosting / analytics | Mintlify at `docs.kombify.io`; repository configuration disables telemetry and page-feedback collection. PostHog and PostHog session recording are not configured. Anonymous hosted verification on 2026-10-21 observed telemetry disabled in the delivered configuration, no PostHog integration or analytics storage, and no session recording on the sampled security/privacy page. This is bounded runtime evidence, not a full privacy or accessibility certification. |

## Known issues

- The Techstack Windows installer is an unsigned Alpha (SmartScreen warning;
  verify the published checksums).
- Additional products stay excluded until an explicit public decision and an
  evidence-backed content audit expand the allowlist.

## Verification

`mise run check` (policy, navigation, content, links), `mise run local:e2e` (local
Mintlify runtime), `mise run remote:public-safety` (deployed surface).
