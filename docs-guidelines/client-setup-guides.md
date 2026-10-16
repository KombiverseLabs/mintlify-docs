# Client setup guides for non-technical readers

Standard for pages that walk someone without technical background through
setting up the apps for a StackKits use case (phone apps, browser extensions,
desktop apps, web interfaces). First example:
`guides/stackkits/use-cases/passwords/clients.mdx`. Contributor guidance,
excluded from the site by `.mintignore`. Public scope, quality gates and one
Diátaxis mode per page come from `DOCUMENTATION-STANDARD.md`; translations
follow `LANGUAGE-LOCALIZATION-STANDARD.md`.

## 1. Audience and tone

The reader is a household member who did not run the kombify setup, knows how
to install an app and has never heard of a reverse proxy. The page is a
how-to: one goal, one path; how the service works belongs on the use-case page.

- Plain words: "vault address", not "endpoint", "route" or "FQDN". Explain an
  unavoidable technical word on first use (the step `faq`).
- One action per click-list item, starting with a verb ("Click", "Tap", "Enter").
- Write on-screen labels exactly as the app's English UI shows them, as
  `[[Label]]` (rendered as a key-cap). Check them against a real capture or
  the vendor's current documentation.
- Explain the concepts the reader meets: server address (with an example such
  as `https://vault.home.test`), which account is meant ("your vault account,
  not your kombify account") and who creates it, and who to ask ("the person
  who set up kombify").
- End every step with what success looks like (`check`).
- Warn only about real consequences (an unrecoverable master password), not
  cosmetic settings.
- No business framing, pricing or plan language; link standards, do not copy them.

### Localization

- Author in English. A translated page keeps the English screenshots (captures
  are tied to one UI language) and says so in its sources note; UI labels
  match the app's UI in that language.
- English pages import `/snippets/client-setup-labels-en.jsx` and pass
  `labels={clientSetupLabelsEn}`. Translated pages pass a complete reviewed
  catalog through `labels`, their `locale`, and `direction="rtl"` for Arabic;
  all component messages, accessible names and announcements come from it.
- Keep guide `id`, step order and verification order identical across locales
  (the browser progress key is locale independent). Do not translate IDs or
  remount with a locale-dependent key. Keep catalog placeholder names; numbers
  are formatted per locale.
- Unpublished previews may compose fallback with
  `{ ...clientSetupLabelsEn, ...proposedLabels }`; fallback is not
  translation completeness.
- Pending for full localized guides: RTL CSS, screenshot language, plural/select
  catalog validation, translated announcements, progress persistence across
  navigation, human review.

## 2. Page structure

Use `ClientSetupGuide` (`snippets/client-setup-guide.jsx`), in this order:

1. **Intro meta**: platforms, number of steps, "No prior knowledge needed".
2. **What you need** (`requirements`): at most four items; link the missing
   case ("No invitation yet?") to an FAQ through `requirementsHelp`.
3. **Get the app(s)** (`apps`): one card per platform, `official: true` (vendor)
   or `false` (third-party badge plus an `appsNote` sentence naming the maker).
4. **Step by step** (`steps`, 3 to 6): `tab` (two words max), `title` (the
   step goal), `intro` (one or two sentences), `clicks` (numbers match the
   screenshot annotations), optional `note` and `faq` (`{ q, a }`), `check`,
   and a `screenshot` or `visual`.
5. **Check it works**: last step, `verify` checkboxes (kept only in the
   reader's browser).
6. **Troubleshooting** (`help`): real failure modes (wrong address, certificate
   warning, lost password, missing store). Server-side fixes point to the owner
   or an owner page.
7. **What's next** (`next`): two cards at most.
8. **Attribution and sources**: app makers, licenses, date images and links
   were checked, capture details.

Location: `guides/stackkits/use-cases/<use-case>/<topic>.mdx`. Register it in
`docs.json` inside the use-case group, add it to `localSmokePaths` in
`public-safety-policy.json` and link it from the use-case page.

## 3. Screenshot policy

Use the first option that applies:

1. **Own screenshots (preferred)**, captured from a local reference install
   with synthetic data using `scripts/guide-screenshots/` (same image as the
   StackKits catalog where one exists). Example addresses only (`*.home.test`
   for home services, `example.com` otherwise); made-up people
   (`alex@example.com`, "Alex Example", an "Example Shop" login); secrets
   generated per run and never stored; reproducible from a scenario file.
2. **Vendor screenshots** only where the license row below permits reuse on a
   commercial site: store in the repository, credit the vendor, link source
   and license, meet the license conditions (no-derivatives forbids crops and
   markers).
3. **Link instead of embed**: a `visual` link card to the vendor page (as step
   5 of the Passwords guide does).

Never store a vendor image without a permitting license. Do not hot-link vendor
images in new guides (leaks reader IPs, hashed URLs break, the license is
unchanged). An existing hot-link (the Immich images in Phone backup) shows a
"Vendor screenshot" label, a credit link and a fallback link, and is to be
replaced with own captures.

Own captures of open-source software are published under that software's
license: credit the project and license; product names and logos stay
trademarks of their owners; imply no endorsement and name unofficial projects
as unofficial (Vaultwarden is not associated with Bitwarden, Inc.).

### Vendor documentation licenses (checked 2026-09-24)

Engineering reading, not legal advice; recheck rows older than a year.

| Vendor docs | License | Reuse of docs images |
| --- | --- | --- |
| Immich (docs.immich.app) | AGPL-3.0, whole repo | Permitted with notice, image copyleft unclear. Capture our own. |
| Bitwarden Help (bitwarden.com/help) | No license; [terms](https://bitwarden.com/terms/) reserve all rights; [trademark guidelines](https://github.com/bitwarden/server/blob/main/TRADEMARK_GUIDELINES.md) | **Not permitted.** Link the help page. Clients are GPL-3.0, so own captures are fine within the trademark rules. |
| Home Assistant (home-assistant.io) and Companion (companion.home-assistant.io) | CC BY-NC-SA 4.0 | **Not permitted** (non-commercial). Link only. |
| Jellyfin (jellyfin.org/docs) | CC BY-ND 4.0 | **Unchanged only**: no crop, resize or markers. Credit, link, license link. |
| Cloudreve (docs.cloudreve.org) | None (all rights reserved) | **Not permitted.** Capture our own (software is GPL-3.0). |
| Paperless-ngx (docs.paperless-ngx.com) | GPL-3.0, whole repo | Permitted with notice, image copyleft unclear. Capture our own; site footer unverified. |
| Gitea (docs.gitea.com) | Apache-2.0 | Permitted with license link and a note of changes; logo trademark unverified. |
| Vaultwarden (server) | AGPL-3.0 | Own captures of the running software. |
| Vaultwarden web vault (bw_web_builds) | GPL-3.0 | Own captures; credit alongside Vaultwarden. |

## 4. Images

- **Format**: WebP from the capture tool (2x device pixels, at most 1600 px
  wide, under about 150 KB each).
- **Path**: `images/guides/<use-case>/<app>/<platform>-<NN>-<slug>.webp`, platform
  `web`, `ios`, `android`, `desktop` or `browser`; e.g.
  `images/guides/passwords/vaultwarden/web-02-create-account.webp`.
- **Crop** to the form, dialog or list; no browser chrome, real address bars
  or unrelated panels.
- **Annotations**: violet numbered rings drawn by the component from
  `annotations: [{ n, top, left, width, height }]` (percent boxes the capture
  tool writes to `captures.json`). Numbers match the click list; `n: null`
  highlights a result. No markers on vendor images, never baked in.
- **Alt text** states what the screenshot shows and the relevant state, not
  "Screenshot of".
- **Theme**: capture in light; the component frames images neutrally in dark
  mode. A dark capture (`--scheme dark`) may be added as `srcDark`.
- **Freshness**: every own screenshot carries `version` and `captured` (ISO
  date), shown in the caption; `captures.json` holds image, version, viewport
  and synthetic account.
- **Re-capture** on a UI change for a step, a major version, a StackKits
  catalog pin change for the app, or a reader report; re-run the scenario and
  update sizes and annotations from `captures.json`.

## 5. Vendor links

- Official domains only (`bitwarden.com`, `apps.apple.com`, `play.google.com`,
  `chromewebstore.google.com`, `addons.mozilla.org`,
  `microsoftedge.microsoft.com`, the project's own site or repository); no
  mirrors, APK sites, blogs or videos.
- Store links use the verified listing ID (App Store `id<number>`, Google Play
  `?id=<package>`, extension IDs or slugs); confirm title and publisher before
  merging.
- Deep-link the specific vendor documentation page for platform details you do
  not reproduce, not the docs home.
- External links open in a new tab with `rel="noopener noreferrer"` and an
  external-link icon (the component does this for `https://` links). No
  tracking parameters, affiliate links or referral codes.
- The sources note states when links were checked.
- Every external URL returns HTTP 200 before merge (`curl -sL -o /dev/null -w
  "%{http_code}"` with a browser user agent). Retry later on 429 instead of
  dropping the link.

## 6. Privacy, accessibility and print

- **Privacy**: no data requested, no accounts connected; progress and ticks
  stay in the reader's `localStorage` (say so in the sources note); no
  third-party images load on page view.
- **Keyboard**: step tabs follow the ARIA tabs pattern (arrows, Home, End);
  all controls are buttons or links; the zoom dialog closes with Escape.
- **Not color-only**: icons and words (check-mark dot, "Official" and
  "Third-party" badges).
- **Alt text** on every image; decorative icons `aria-hidden`; external links
  announce "opens in a new tab".
- **Print**: all steps expanded without navigation controls; link cards print
  their URL.

## 7. Review checklist

- [ ] Subpage of its use case, in `docs.json`, linked from the use-case page,
      listed in `localSmokePaths`.
- [ ] 3 to 6 steps, each with goal, click list, `check` and a screenshot or
      vendor link card.
- [ ] UI labels match the captured or documented app, in `[[...]]`; jargon
      explained or avoided ("server address", "account" on first use).
- [ ] Screenshots are own synthetic captures or vendor images the license row
      permits; no new hot-links; path, size, WebP, annotation, alt text,
      version and capture date rules met.
- [ ] App cards: store IDs verified, vendor named, third-party marked.
- [ ] External links return 200, open in a new tab, carry no affiliate or
      tracking parameters; "checked" date set.
- [ ] Attribution names app makers, licenses and non-affiliation.
- [ ] `mise run check` passes; page viewed in the local preview in light, dark
      and mobile widths and printed once.

## Component notes

- The component renders on the client, so props text is not indexed by
  Mintlify search; put search terms into `description` and `keywords`.
- The local preview may miss snippet edits; restart `mise run dev` after
  changing `snippets/client-setup-guide.jsx`.
- Panels switch visibility by class, not `[hidden]`, so steps are not hidden
  in print.
