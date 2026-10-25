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

English is the only language that is written and edited by hand. It is the
source and keeps its URLs (`/stackkits/quickstart`). The other locales (`ar`,
`de`, `es`, `zh-Hans`, `hi`; Traditional Chinese is `zh-Hant`, never mapped to
Simplified) are generated from the English pages into `<code>/` folders
(`de/stackkits/quickstart` is served at `/de/stackkits/quickstart`) and arrive
as pull requests that are reviewed and merged like any other change. Nobody
translates a page by hand and no English change waits for a translation.

Mintlify's own automatic translation is a paid add-on of its Pro plan with
usage-based AI credits, which is above the documentation budget. The
generation therefore runs as a repository job on kombify's own AI platform;
until that job is merged, the existing locale files stay as they are and new
English pages are reported as pending.

How the pieces fit:

- Each locale is a language branch in `docs.json` (`navigation.languages`).
  `node scripts/i18n/sync-navigation.mjs <code>` rebuilds a branch from the
  English tree and leaves out pages that have no translated file yet.
- Published locales are listed in `allowedNavigationLanguages` of
  `public-safety-policy.json`, with the localized tab names in
  `allowedNavigationTabs` and `<code>/` in `allowedPagePrefixes`.
- `node scripts/i18n/check.mjs <code>` (part of `mise run check`) validates
  existing translations: required frontmatter, visibility and routing values,
  provenance restrictions, and internal links and anchors. Optional metadata,
  examples and components may differ. Missing counterparts are reported as
  `pending_translation`; presence enforcement via `--strict` is no longer
  supported, and the obsolete `I18N_STRICT` environment variable is ignored
  with a diagnostic.
- Translations retain product names (kombify, StackKits, Techstack, Companion,
  SpeechKit, Paperwork, kombify Cloud, kombify Sites, Simulate, CUE) and point
  internal links to `/<code>/...`.

- Generated English pages (`stackkits/reference/cli/*`,
  `techstack/reference/cli/*`, release pages) are rendered from release data;
  their localized copies arrive with the next translation pull request.

Locale semantics are in `KOMBIFY-DESIGN-SYSTEM-STANDARD.md` §11.

## Runtime

| Concern | Choice |
| --- | --- |
| Site | Mintlify (`docs.json`), hosted at `docs.kombify.io` |
| Toolchain | `mise`, Node 24, pinned `mint@4.2.684` |
| Validation | PowerShell gates plus `public-safety-policy.json` |
| Analytics | Repository configuration disables Mintlify telemetry; PostHog and PostHog session recording are not configured |

Disabling Mintlify telemetry also disables collection of page feedback. See
[Mintlify's privacy settings](https://www.mintlify.com/docs/integrations/privacy/overview).

## Commands

```powershell
mise install
mise run check
mise run local:e2e
```

| Command | Purpose |
| --- | --- |
| `mise run dev` | Pinned local Mintlify preview. |
| `mise run check` | Locale checks, positive scope, navigation, content and local links. |
| `mise run local:e2e` | `mint validate` plus allowed and forbidden routes over real local HTTP; must pass before publication. |
| `mise run remote:public-safety` | Deployed route and projection matrix. |
| `mise run postlive:wait-exact-live` | Wait for a successful `docs.kombify.io` deployment at exact `SOURCE_SHA`. |
| `scripts/check-stackkits-release-truth.ps1` | Installer commands on the current public release, no stale lifecycle wording. |
| `scripts/check-stackkits-external-links.ps1` | Optional registered StackKits destinations actually offered as publishable literals. |
| `scripts/check-speechkit-release-truth.ps1` | Validate offered SpeechKit claims and mutable download links; check existing generated release blocks. |
| `scripts/check-techstack-public-boundary.ps1` | Validate existing generated references against one release and source SHA; reject private API operations. |
| `scripts/check-product-docs-external-links.ps1` | Optional registered Techstack and SpeechKit destinations actually offered as publishable literals. |
| `scripts/check-code-example-relevance.ps1` | Executable and structured examples only on pages with a topic-specific workflow or configuration. |
| `scripts/render-api-surface-reference.mjs` | Render a release's OpenAPI and `api-surface.json` into the API and CLI reference; `--check` reports drift. |

## Telemetry regression journey

Use a deployed PR preview with production analytics initialization in a fresh
private browser context. This public reading flow needs no sign-in. The pinned
development preview is a navigation smoke only: its development mode suppresses
analytics independently of this configuration.

1. Capture network requests from the initial home-page load, then follow the
   published StackKits overview and identity links through the UI.
2. Reload and navigate back. Assert that no request goes to
   `/_mintlify/api/v1/e`, `e.kombify.io` or a PostHog collection endpoint.
3. Assert that `mintlify_anonymous_id` and `mintlify_session_id` are absent
   from browser storage, and that documentation navigation still works.
4. Record the tested source and preview or deployment identity with the
   observations. Page-feedback collection is intentionally disabled with telemetry.

## Documents

[STATUS.md](STATUS.md) (published and verified now) -
[ROADMAP.md](ROADMAP.md) (milestones) -
[CONTRIBUTING.md](CONTRIBUTING.md) -
[AGENTS.md](AGENTS.md) -
[openwiki/](openwiki/) (generated, non-authoritative agent documentation).
Standards: [DOCUMENTATION-STANDARD.md](../DOCUMENTATION-STANDARD.md),
[KOMBIFY-DESIGN-SYSTEM-STANDARD.md](../KOMBIFY-DESIGN-SYSTEM-STANDARD.md) §11,
[CODE-INTELLIGENCE-STANDARD.md](../platform/standards/CODE-INTELLIGENCE-STANDARD.md) §11.

## Issue tracking

```bash
bd ready
bd show <id>
bd update <id> --claim
bd close <id>
```

The external checks retain their six/ten destination registries as a bounded
coverage scope, not required content. They HEAD only exact registered HTTPS
literals offered in non-ignored MDX or `docs.json` href values; no offered
registered destinations succeeds with `checked: 0`. Fragments are removed;
path case and queries remain significant (a latest-download link is not a
latest-release link). Redirects stay HTTPS without credentials, at most five
hops within the original per-destination timeout; HEAD never downloads assets.
Logs omit query strings and redirect locations.

Literal coverage includes inline/reference Markdown links, autolinks, literal
JSX href attributes (including quoted expressions), and used local default MDX
snippet imports. Comments, frontmatter, inline/fenced code examples, ignored
files and unused snippets are excluded. Discovery and the public-safety MDX
scan include dot-prefixed files because Mintlify serves those pages too; the
privacy scan retains its existing allowlist and forbidden-content checks. A narrow exception retains literal
`curl`/`wget` installer URLs on install/base/cloud.stackkit.cc in shell fences.
Braced MDX expressions are omitted except quoted literal href values. MDX
files declaring exports are reported as unevaluated and skipped, so unused JSX
exports cannot create probes. Per-file diagnostics and aggregate unresolved
expression/exported-module counts are reported separately from offered literals;
values are never logged or evaluated. Dynamic MDX and JavaScript/JSX component
evaluation are outside this scope; this
is not an all-links audit or historical-link crawl. New destinations need an
explicit registry update to receive these network checks.

Remote safety inspects `llms.txt` when present (200), accepts its absence
(404/410), and rejects other statuses or transport failures, as for sitemap.
Private paths and markers still fail when exposed in a present projection.
