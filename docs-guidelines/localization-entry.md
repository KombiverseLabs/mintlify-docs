# Customer documentation entry localization

Status: implementation foundation; translation and publication pending.

The workspace `LANGUAGE-LOCALIZATION-STANDARD.md` owns locale semantics and
review requirements. `public-docs` remains planned in its localization surface
manifest. This contributor document is excluded by `.mintignore`.

## Published scope

English is the only published locale. Keep the current English routes and
`docs.json` navigation intact. The public-safety allowlist now admits only `en`
and existing public pages. The previous target-language entries, including
`cn/index`, were not evidence of reviewed content and have been removed.

Use ignored `drafts/` for translation proposals. Do not put proposals into
navigation, a public snippet catalog, or a hidden public MDX page. Hidden
navigation is not a publication boundary. A future reviewed release must update
the policy, navigation, pages, and live smoke paths together.

## Native Mintlify locale contract

The pinned `mint@4.2.684` installation resolved `@mintlify/validation@0.1.778`.
Its `baseLanguageSchema` accepts `en`, `de`, `es`, `zh-Hans`, `hi`, and `ar`.
The schema also accepts legacy `cn`; new navigation and URLs use canonical
`zh-Hans` directly. No alias adapter is needed for that resolved schema. Recheck
the installed validation package when updating the CLI: the CLI pin does not
independently pin all transitive dependencies.

The [Mintlify navigation documentation](https://www.mintlify.com/docs/organize/navigation)
still lists `cn`; package validation is the evidence for canonical `zh-Hans`
support. Schema acceptance alone does not prove the rendered document language,
switcher labels, SEO metadata, or language routing. Those remain preview and live
acceptance work. Traditional Chinese must never be mapped to Simplified Chinese.

## First reviewed entry tranche

Prepare translations of the existing `index.mdx` entry using language-specific
MDX at `de/index`, `es/index`, `zh-Hans/index`, `hi/index`, and `ar/index`.
Keep the existing English navigation as the default language branch when
introducing Mintlify `navigation.languages`. Preserve current English URLs;
translated entry pages link explicitly to the English product guides until
equivalent reviewed translations exist. Make those destination languages clear.

Translate metadata and navigation together with prose. Do not advertise a locale
before its entry content and shared labels have competent-speaker review. Check
the separate English shortcut, keyboard operation, RTL and long labels, resource
and anchor preservation, and English fallback. Verify self-canonical URLs,
reciprocal `hreflang`, `x-default`, and sitemap output before publication.

Mintlify offers dashboard language auto-routing, but its account/local-preference
precedence, Automatic reset behavior, quality exclusions, and cache behavior have
not been qualified against the workspace contract. Keep routing changes pending
until that qualification exists; an explicit localized URL must remain stable.

## Shared interactive guide

`ClientSetupGuide` takes a separate message catalog, `locale`, and `direction`.
The existing English guide passes `clientSetupLabelsEn`. Guide IDs and local
progress storage stay independent of language. This extraction enables translated
props; it is not proof of a complete localized guide. Full RTL CSS, screenshot
language, plural/select catalog validation, translated accessible announcements,
progress persistence across document navigation, human review, and signed
exact-source rollout evidence remain pending.
