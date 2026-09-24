# Client setup guides for non-technical readers

This standard covers pages that help someone without technical background set
up the apps they use with a kombify StackKits use case: phone apps, browser
extensions, desktop apps and web interfaces. The first example is
`guides/stackkits/use-cases/passwords/clients.mdx`.

This file is contributor guidance. `.mintignore` keeps it off the public site.
Workspace authorities still apply: `DOCUMENTATION-STANDARD.md` (public scope,
quality gates, one Diátaxis mode per page) and
`LANGUAGE-LOCALIZATION-STANDARD.md` (English source, reviewed translations).

## 1. Audience and tone

The reader is a household member. Someone else, the owner, ran the kombify
setup. The reader knows how to install an app and has never heard of a
reverse proxy.

- Use plain words. Say "vault address", not "endpoint", "route" or "FQDN". If
  a technical word is unavoidable, explain it the first time it appears, as
  the `faq` of that step does.
- One action per click-list item. Start with the verb: "Click", "Tap", "Enter",
  "Open".
- Write every on-screen label exactly as the app shows it, in the app's
  English UI, as `[[Label]]`. The component renders it as a key-cap. Check
  labels against a real capture or the vendor's current documentation, not
  from memory.
- Explain the concepts the reader will meet:
  - **Server address**: "the web address of your household's ...", with an
    example they can compare against, such as `https://vault.home.test`.
  - **Account**: say which account is meant ("your vault account, not your
    kombify account") and who creates it.
  - **Who to ask**: "the person who set up kombify".
- Say what success looks like after every step (`check`). The reader should
  know they are on track before moving on.
- Warn only about real consequences. A master password that nobody can
  recover deserves a warning. A cosmetic setting does not.
- Use no business framing, pricing or plan language. Link standards instead of
  copying them.

The page is a **how-to** in the Diátaxis sense: one user goal, one path. Leave
out explanations of how the service works, which belong to the use-case page.

### Language

Author in English. Translations follow `LANGUAGE-LOCALIZATION-STANDARD.md`:
localized MDX under the Mintlify language navigation, reviewed by a competent
speaker before publication. UI labels in a translated page must match the app's
UI in that language. Captures are tied to one UI language. Until localized
captures exist, a translated page keeps the English screenshots and says so in
its sources note.

## 2. Page structure

Each guide uses the `ClientSetupGuide` component (`snippets/client-setup-guide.jsx`)
and keeps this order:

1. **Intro meta**: platforms, number of steps, "No prior knowledge needed".
2. **What you need** (`requirements`): at most three items. Link the missing
   case, such as "No invitation yet?", to an FAQ entry through
   `requirementsHelp`.
3. **Get the app(s)** (`apps`): one card per platform. See section 5 for link
   rules. Mark every card `official: true` (made by the vendor) or
   `official: false` (third-party). Third-party apps get the "Third-party"
   badge and a sentence in `appsNote` that says who makes them.
4. **Step by step** (`steps`): 3 to 6 steps. Each step has:
   - `tab`: two words or fewer;
   - `title`: the goal of the step, in plain words;
   - `intro`: one or two sentences of context;
   - `clicks`: the click list. Annotation numbers in the screenshot match the
     click-list numbers;
   - `note` (optional): one micro-note, such as a caveat or a tip;
   - `faq` (optional): one or more `{ q, a }` for the question readers ask
     at this point;
   - `check`: what the reader sees when the step worked;
   - `screenshot` or `visual`. See sections 3 and 5.
5. **Check it works**: the last step lists what the reader confirms
   (`verify`). The checkboxes stay in the reader's browser only.
6. **Troubleshooting** (`help`): the real failure modes, such as a wrong
   address, a certificate warning, a lost password or a missing store.
   Answers point to the owner or to an owner page when the fix is on the server.
7. **What's next** (`next`): two cards at most, such as a security step for the
   reader and a backup page for the owner.
8. **Attribution and sources**: who makes the apps, their license, the date
   the images and links were checked, and the capture details.

### Where the pages live

A client guide is a subpage of its use case, next to the application page:

```text
guides/stackkits/use-cases/<use-case>/<topic>.mdx
```

Register it in `docs.json` inside the use-case group (see Photos → Phone
backup and Passwords → Password apps). Add it to `localSmokePaths` in
`public-safety-policy.json`, and link it from the use-case page.

## 3. Screenshot policy

Use the first option that applies:

1. **Own screenshots (preferred).** Capture them from a local reference
   install with synthetic data, using `scripts/guide-screenshots/` (see its
   README). A reference install uses the same image the StackKits catalog
   delivers where one exists. Rules:
   - example addresses only: `*.home.test` for home services and
     `example.com` for anything else;
   - made-up people and data, such as `alex@example.com` "Alex Example" and an
     "Example Shop" login. Never use real names, real accounts or personal
     data;
   - secrets are generated per run and never stored;
   - the capture must be reproducible from a scenario file in the repository.
2. **Vendor screenshots**, only where the vendor's documentation license
   permits reuse on a commercial site (table below). Store the file in the
   repository under the naming rules, credit the vendor, link the source page
   and the license, and meet the license conditions. For example, a
   no-derivatives license forbids crops and annotation markers.
3. **Link instead of embed.** If reuse is not permitted or not verified, show
   no image. Use a `visual` link card to the vendor's page for that screen,
   as step 5 of the Passwords guide does.

Never store a vendor image in the repository without a permitting license.
Do not hot-link vendor images in new guides: each request sends the reader's
IP address to a third party, hashed asset URLs break when the vendor rebuilds
its docs, and hot-linking does not change the license. An existing hot-link,
such as the Immich images in Phone backup, must show a "Vendor screenshot"
label, a credit link and a fallback link, and it is scheduled for replacement
with own captures.

Screenshots of open-source software that we run and capture ourselves are
our own images. Product names and logos in them stay trademarks of their
owners. Do not suggest endorsement, and name an unofficial project as
unofficial. For example, Vaultwarden is not associated with Bitwarden, Inc.

### Vendor documentation licenses (checked 2026-09-24)

This is an engineering reading, not legal advice. Check again before relying
on a row that is older than a year.

| Vendor docs | License | Source | Reuse of docs images |
| --- | --- | --- | --- |
| Immich (docs.immich.app) | AGPL-3.0, whole repo; `docs/` has no separate license | https://github.com/immich-app/immich/blob/main/LICENSE | Permitted with notice, but copyleft on a copied image is unclear. Capture our own. |
| Bitwarden Help (bitwarden.com/help) | No license; website terms reserve all rights | https://bitwarden.com/terms/ ; logos: https://github.com/bitwarden/server/blob/main/TRADEMARK_GUIDELINES.md | **Not permitted.** Link to the help page. Clients are GPL-3.0, so our own captures are fine within the trademark rules. |
| Home Assistant (home-assistant.io) | CC BY-NC-SA 4.0 | https://github.com/home-assistant/home-assistant.io/blob/current/LICENSE.md | **Not permitted** (non-commercial). Link only. |
| Home Assistant Companion (companion.home-assistant.io) | CC BY-NC-SA 4.0 | https://github.com/home-assistant/companion.home-assistant/blob/master/LICENSE.md | **Not permitted** (non-commercial). Link only. |
| Jellyfin (jellyfin.org/docs) | CC BY-ND 4.0 | https://github.com/jellyfin/jellyfin.org/blob/master/LICENSE | Permitted **unchanged only**: no crop, resize or markers. Credit, link and license link. |
| Cloudreve (docs.cloudreve.org) | None, so all rights reserved | https://github.com/cloudreve/docs | **Not permitted.** Capture our own (the software is GPL-3.0). |
| Paperless-ngx (docs.paperless-ngx.com) | GPL-3.0, whole repo | https://github.com/paperless-ngx/paperless-ngx/blob/dev/LICENSE | Permitted with notice, but image copyleft is unclear. Capture our own. The site footer was not verified. |
| Gitea (docs.gitea.com) | Apache-2.0 | https://gitea.com/gitea/docs | Permitted with the license link and a note of changes. Logo trademark not verified. |
| Vaultwarden (software) | AGPL-3.0 | https://github.com/dani-garcia/vaultwarden/blob/main/LICENSE.txt | Own captures of the running software. |

## 4. Images

- **Format**: WebP, written by the capture tool. It stores images at 2x
  device pixels and at most 1600 px wide. Keep a single image under about
  150 KB.
- **Path**: `images/guides/<use-case>/<app>/<platform>-<NN>-<slug>.webp`,
  where the platform is one of `web`, `ios`, `android`, `desktop` or
  `browser`. Example:
  `images/guides/passwords/vaultwarden/web-02-create-account.webp`.
- **Crop** to the part of the screen the step is about: the form, dialog or
  list. Leave out browser chrome, real address bars and unrelated panels.
- **Annotations**: violet numbered rings overlaid by the component from
  percentage boxes (`annotations: [{ n, top, left, width, height }]`). The
  capture tool computes them from the elements it clicks and writes them to
  `captures.json`. Numbers match the click list. Never bake markers into a
  vendor image.
- **Alt text** describes what the screenshot shows and the state that
  matters, such as "Create account form with the email address
  alex@example.com". Don't start with "Screenshot of".
- **Light and dark**: capture in the app's light theme. The component frames
  images on a neutral surface in dark mode. A dark capture
  (`--scheme dark`) can be added as `srcDark`, but it is not required.
- **Freshness metadata** on every own screenshot: `version` (app and UI
  version) and `captured` (ISO date). Both appear in the caption.
  `captures.json` holds the full record: image, version, viewport and
  synthetic account.
- **Re-capture** when the app's UI for a step changes, when a major version
  ships, when the StackKits catalog pin for that app changes, or when a
  reader reports a mismatch. Re-run the scenario, then update sizes and
  annotations in the MDX from `captures.json`.

## 5. Vendor links

- Link only official domains, such as `bitwarden.com`, `apps.apple.com`,
  `play.google.com`, `chromewebstore.google.com`, `addons.mozilla.org`,
  `microsoftedge.microsoft.com` and the project's own site or repository.
  Don't link to mirrors, APK sites, blogs or videos.
- Store links use the verified listing ID: App Store `id<number>`, Google
  Play `?id=<package>`, and Chrome, Edge or Firefox extension IDs or slugs.
  Before merging, open each listing and confirm that the title and publisher
  are the vendor's.
- Deep-link to the vendor's documentation for platform details you don't
  reproduce, such as "Connect an app to your own server". Link the specific
  page, not the docs home.
- External links open in a new tab with `rel="noopener noreferrer"` and an
  external-link icon. The component does this for `https://` links. Use no
  tracking parameters, no affiliate links and no referral codes.
- The sources note states when the links were checked ("Store links and help
  pages were checked on <date>").
- Every external URL returns HTTP 200 before merge (`curl -sL -o /dev/null -w
  "%{http_code}"` with a browser user agent). Store pages can rate-limit with
  429. Retry later rather than dropping the link.

## 6. Privacy, accessibility and print

- **Privacy**: the guide asks for no data and connects no accounts. Progress
  and ticks stay in `localStorage` in the reader's browser, and the sources
  note says so. No third-party images load on page view.
- **Keyboard**: the step tabs follow the ARIA tabs pattern (arrow keys, Home,
  End), all controls are buttons or links, and the zoom dialog closes with
  Escape.
- **Not color-only**: status uses icons and words (the check-mark step dot,
  "Official" and "Third-party" badges), not only color.
- **Alt text** on every image. Decorative icons are `aria-hidden`, and
  external links announce "opens in a new tab".
- **Print**: the print button prints all steps expanded without navigation
  controls. Link cards print their URL.

## 7. Review checklist

- [ ] Page is a subpage of its use case, registered in `docs.json`, linked
      from the use-case page, and listed in `localSmokePaths`.
- [ ] 3 to 6 steps. Each has a goal, a click list, a `check`, and a screenshot
      or vendor link card.
- [ ] Every UI label matches the captured or documented app, in `[[...]]`.
- [ ] Jargon is explained or avoided. "Server address" and "account" are
      explained where they first appear.
- [ ] Screenshots are own captures from the scenario script with synthetic
      data, or vendor images whose license row permits it. No new hot-links.
- [ ] Images follow the path, size and WebP rules. Annotations match the
      click-list numbers. Alt text is present. Version and capture date are
      in the caption.
- [ ] App cards: official store IDs verified, vendor named, third-party apps
      marked.
- [ ] All external links return 200 and open in a new tab. No affiliate or
      tracking links. The "checked" date is set.
- [ ] Attribution names who makes each app, the license, and any
      non-affiliation.
- [ ] `mise run check` passes. The page was viewed in the local preview in
      light, dark and mobile widths, and printed once.

## Component notes

- The component renders on the client, as Mintlify snippets do. Text passed
  in props is not indexed by Mintlify search like MDX body text. Put the
  terms readers search for into `description` and `keywords`.
- Mintlify's local preview does not always pick up snippet edits. Restart
  `mise run dev` after changing `snippets/client-setup-guide.jsx`.
- Panels switch visibility by class, not the `hidden` attribute. Mintlify's
  layered `[hidden]` rule would otherwise hide steps in print.
