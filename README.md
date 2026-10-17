# mintlify-docs

[![Maturity: alpha](https://img.shields.io/badge/maturity-alpha-orange.svg)](STATUS.md)

Single source of truth for kombify's anonymous public documentation at
`https://docs.kombify.io`: the published MDX tree, Mintlify navigation
(`docs.json`), the positive publication allowlist (`public-safety-policy.json`)
and the local and live gates. It owns no product code. Internal infrastructure
and operator runbooks stay out; Simulate is reached through the kombify Cloud
dashboard.

## Public scope

| Tab | Content |
| --- | --- |
| Start | Product entry points and current availability. |
| StackKits | Released kits, modules, workflows, CLI and MCP documentation. |
| Techstack | Preview product boundary, operating modes, availability, release-bound API and `techstack api` CLI reference. |
| SpeechKit | Released Windows beta, voice modes, Go framework. |
| Identity & Access | The identity boundary relevant to StackKits. |
| Changelog | Customer-facing product updates. |

Truth sources, never the retired legacy documentation repository:

- StackKits and SpeechKit: public releases and assets (synced into `data/`
  by generated-only pull requests).
- Techstack: the product contract and preview status, with no public installer
  or source distribution presented. The reference under `techstack/reference/`
  is generated only from `api/surface/openapi.public.yaml` and
  `api/surface/api-surface.json` of a published release
  (`.github/workflows/techstack-release-docs.yml`); without both, it does not
  exist.
- Workspace standards define documentation and delivery policy and are linked,
  never copied.

## Publication boundary

- `public-safety-policy.json` is the positive allowlist: a page must match an
  approved path or prefix, appear in `docs.json` and pass the forbidden-content
  checks. Hidden navigation and Mintlify authentication do not make a reachable
  file safe.
- A StackKits page needs the current public release as evidence; presence in the
  repository, draft metadata or preview status is not evidence.
- SpeechKit instructions are pinned to its exact public release and assets.
- Pull requests run the trusted public safety workflow without private
  credentials or a shared writable tool cache; the validator and the exact-head
  check must succeed.

## Localization

English is the source and keeps its URLs (`/stackkits/quickstart`). Every other
locale is a language branch in `docs.json` (`navigation.languages`) with its
pages under `<code>/` (`de/stackkits/quickstart` is served at
`/de/stackkits/quickstart`). Published locales are listed in
`allowedNavigationLanguages` of `public-safety-policy.json`. Codes: `ar`, `de`,
`en`, `es`, `zh-Hans`, `hi` (Traditional Chinese is `zh-Hant`, never mapped to
Simplified). The pinned CLI's validation accepts these codes; recheck the
installed `@mintlify/validation` when bumping `mint`. A locale is advertised
only after competent-speaker review; locale semantics are in
`KOMBIFY-DESIGN-SYSTEM-STANDARD.md` §11. Unreviewed proposals stay in ignored
`drafts/`, never in navigation or hidden public MDX.

Adding or updating a locale (`<code>`):

1. Add `scripts/i18n/labels/<code>.json` (tab and group names) and enable the
   code in `LOCALES` of `scripts/i18n/sync-navigation.mjs`.
2. Translate each English `P.mdx` to `<code>/P.mdx`: keep frontmatter keys, MDX
   components, props and images; translate prose, `title`, `description`,
   `sidebarTitle` and human-readable props; copy fenced code byte for byte;
   leave product names (kombify, StackKits, Techstack, Companion, SpeechKit,
   Paperwork, kombify Cloud, kombify Sites, Simulate, CUE) and CLI commands,
   flags, paths and identifiers; rewrite internal links to `/<code>/...` (anchors
   follow the translated heading). Guides import translated catalogs
   (`snippets/client-setup-labels-<code>.jsx`,
   `snippets/photo-backup-guide-<code>.jsx`); check RTL locales with
   `dir="rtl"`.
3. `node scripts/i18n/sync-navigation.mjs <code>` rebuilds the locale branch of
   `docs.json` from the English tree.
4. In `public-safety-policy.json` add the code to `allowedNavigationLanguages`,
   the localized tab names to `allowedNavigationTabs` and `<code>/` to
   `allowedPagePrefixes`.
5. `node scripts/i18n/check.mjs <code>` (part of `mise run check`) fails on a
   missing counterpart, changed frontmatter keys, differing code blocks or
   component tags, and unresolved internal links or anchors.

Generated English pages (`stackkits/reference/cli/*`, `techstack/reference/cli/*`,
release pages) are rendered from release data; regenerate or re-translate their
localized copies after each release. Locale catalogs for staged pages live in
`localization/` (exported with `scripts/i18n/export-catalog.mjs`).

## Runtime

| Concern | Choice |
| --- | --- |
| Site | Mintlify (`docs.json`), hosted at `docs.kombify.io` |
| Toolchain | `mise`, Node 24, pinned `mint@4.2.684` |
| Validation | PowerShell gates plus `public-safety-policy.json` |
| Analytics | PostHog via `e.kombify.io`, session recording disabled |

## Commands

```powershell
mise install
mise run check
mise run local:e2e
```

| Command | Purpose |
| --- | --- |
| `mise run dev` | Pinned local Mintlify preview. |
| `mise run check` | Locale checks, generator tests, positive scope, navigation, content and local links. |
| `mise run local:e2e` | `mint validate` plus allowed and forbidden routes over real local HTTP; must pass before publication. |
| `mise run public-safety:test` | Fail-closed policy regression tests. |
| `mise run remote:public-safety` | Deployed route and projection matrix. |
| `mise run postlive:wait-exact-live` | Wait for a successful `docs.kombify.io` deployment at exact `SOURCE_SHA`. |
| `scripts/check-stackkits-release-truth.ps1` | Installer commands on the current public release, no stale lifecycle wording. |
| `scripts/check-stackkits-external-links.ps1` | Website, installer and release destinations of the StackKits quickstart. |
| `scripts/check-speechkit-release-truth.ps1` | SpeechKit version, platform, module and Windows assets pinned to the public release. |
| `scripts/check-techstack-public-boundary.ps1` | Windows Alpha links, pre-1.0 availability boundary, generated reference bound to one release. |
| `scripts/check-product-docs-external-links.ps1` | Public Techstack entry and SpeechKit release destinations. |
| `scripts/check-code-example-relevance.ps1` | Executable and structured examples only on pages with a topic-specific workflow or configuration. |
| `scripts/render-api-surface-reference.mjs` | Render a release's OpenAPI and `api-surface.json` into the API and CLI reference; `--check` reports drift. |

## Documents

[STATUS.md](STATUS.md) (published and verified now) -
[ROADMAP.md](ROADMAP.md) (milestones) -
[CONTRIBUTING.md](CONTRIBUTING.md) -
[AGENTS.md](AGENTS.md) -
[openwiki/](openwiki/) (generated, non-authoritative agent documentation).
Standards: [DOCUMENTATION-STANDARD.md](../DOCUMENTATION-STANDARD.md),
[KOMBIFY-DESIGN-SYSTEM-STANDARD.md](../KOMBIFY-DESIGN-SYSTEM-STANDARD.md) §11,
[CODE-INTELLIGENCE-STANDARD.md](../kombify-Core/standards/CODE-INTELLIGENCE-STANDARD.md) §11.

## Issue tracking

```bash
bd ready
bd show <id>
bd update <id> --claim
bd close <id>
```
