# Apps docs: Cloud, AI Guide and Workbench, Companion (staged)

Status 2026-10-15: English sources are written and staged here (`drafts/` is
excluded by `.mintignore` and by `scripts/i18n/check.mjs`). Nothing is
published and no locale advertises these pages.

Why staged: workspace `DOCUMENTATION-STANDARD.md` keeps Cloud, Workbench and
Companion out of Tier 1 until a publication decision updates that section and
the Mintlify allowlist together, and `mise run check` fails on an English page
without a reviewed counterpart in every locale. Staging keeps `main` green.

## Pages (all English source, one Diátaxis mode each)

| Page | Mode |
| --- | --- |
| `cloud/overview` | explanation |
| `cloud/get-started` | how-to |
| `cloud/plans-and-billing` | how-to |
| `ai/overview` | explanation |
| `ai/open-the-workbench` | how-to |
| `companion/overview` | explanation |

Claims are limited to what product sources state (alpha, open sign-up, hosted
login, Stripe monthly/quarterly, Guide without account, no provider keys in the
desktop client, Companion internal preview). Prices, plan names and UI labels
are left out until a live capture exists. Re-verify against live behavior before
publication; Companion Feed and household are source-only at 2026-10-09.

Files are named `*.draft.mdx` (the public-safety gate honours that `.mintignore` rule; a plain `drafts/` rule did not exclude them). Rename back to `.mdx` on activation.

## Activation (one PR, after translations exist)

1. Produce `<code>/apps/**` for `de es zh-Hans hi ar` with the localization
   producer; fill the `Apps`, `AI Guide and Workbench` labels in
   `scripts/i18n/labels/<code>.json`.
2. `git mv drafts/apps/{cloud,ai,companion} apps/` and add `nav-fragment.json`
   as a tab after `SpeechKit` in the `en` branch of `docs.json`; run
   `node scripts/i18n/sync-navigation.mjs`.
3. In `public-safety-policy.json` add the tab names (all 6 languages) to
   `allowedNavigationTabs` and `apps/` to `allowedPagePrefixes`.
4. Run `node scripts/i18n/check.mjs <code>` for every locale.
5. Workspace PR: update the Tier-1 scope list in `DOCUMENTATION-STANDARD.md`
   (publication decision) in the same change.
