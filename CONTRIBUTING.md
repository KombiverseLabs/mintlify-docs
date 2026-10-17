# Contribute to the documentation

1. Edit a page on GitHub ("Edit this file"), or fork and clone, run
   `mise install`, and branch.
2. Write and register English pages only: add each new page to the `en` branch
   of `docs.json`. Do not write or edit translations; they are generated and
   delivered by pull request (see README, Localization).
3. Run `mise run check`, then `mise run local:e2e` (real HTTP preview gate).
4. Open a pull request.

## Public-only rule

Every file here is treated as anonymously publishable. Do not rely on hidden
navigation, `public: false`, group frontmatter or provider authentication:
direct routes, search, `llms.txt`, MCP projections and previews can expose the
file. Keep unfinished or internal material in its owning product repository;
move it here only when sanitized, customer-facing, registered in `docs.json`
and ready for anonymous publication.

## Writing

- Active voice, address the reader as "you", one idea per sentence.
- Lead with the goal; show examples; use one term per concept.
- Examples are public-safe: no operator secret names, private origins,
  internal runbooks, customer data or live credentials.

## Client setup guides

Pages that walk non-technical readers through apps for a use case follow
[docs-guidelines/client-setup-guides.md](docs-guidelines/client-setup-guides.md)
(tone, structure, screenshot and vendor-link policy, review checklist). Build
them with `snippets/client-setup-guide.jsx`; capture screenshots with
[scripts/guide-screenshots](scripts/guide-screenshots/README.md).
