---
title: mintlify-docs Status
last_verified: 2026-10-16
maturity: alpha
---

# mintlify-docs Status

Verified 2026-10-15: `mise run check` and `mise run remote:public-safety` pass
on `main`. Cloud, AI Guide and Workbench, and Companion pages exist only as
staged English sources (plus locale drafts) in `drafts/apps/`; nothing of them
is published.

## Public surface

- Published at `docs.kombify.io` from this repository via Mintlify.
- Six tabs (the `docs.json` navigation is the page inventory): Start,
  StackKits (largest; CLI reference generated), Techstack, SpeechKit,
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
| StackKits | Docs snapshot `v0.53.9` (`data/stackkits/latest.json`); newer releases arrive through the generated-only sync PR. |
| Techstack | Public unsigned Windows Alpha; API and CLI reference synced from release `v0.41.0`; `techstack/availability` names the current release. |
| SpeechKit | Docs snapshot `v0.76.6` (`data/speechkit/latest.json`). |
| Mintlify CLI / Node | `mint@4.2.684` / Node 24 through `mise`. |
| Hosting / analytics | Mintlify at `docs.kombify.io`; repository configuration disables telemetry and page-feedback collection. PostHog and PostHog session recording are not configured. Hosted verification is pending. |

## Known issues

- The Techstack Windows installer is an unsigned Alpha (SmartScreen warning;
  verify the published checksums).
- Additional products stay excluded until an explicit public decision and an
  evidence-backed content audit expand the allowlist.

## Verification

`mise run check` (policy, navigation, content, links), `mise run
public-safety:test` (forbidden content fails), `mise run local:e2e` (local
Mintlify runtime), `mise run remote:public-safety` (deployed surface).
