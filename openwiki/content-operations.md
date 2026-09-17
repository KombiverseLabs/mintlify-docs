---
type: Documentation Operations Guide
title: Content operations and generated documentation
description: How authored public MDX, generated StackKits release pages, changelog updates, Git review, and scheduled workflows are maintained in mintlify-docs.
tags: [documentation-operations, generated-content, github-actions, changelog, stackkits]
---

# Content operations and generated documentation

> **Generated against:** `fc905e821407cc6f74f0252d7724a9a4dcd7cf81`
>
> **Corrected by hand:** 2026-09-17 against `eab170f6ca19c5b135b794d5b8043233cded9ca4`: the generated service-guide pipeline is retired.

## Authoring and review boundary

`README.md` defines this repository as the public documentation surface and requires source-verified content. `CONTRIBUTING.md` offers general contribution advice, but it appears template-derived and refers to a missing `development.mdx`; rely on `README.md`, `mise.toml`, and current scripts for operational commands.

All content changes should remain public-safe, reviewable in Git, and validated with the local checks in [site and publication model](site-publication.md#local-checks). That publication model **depends on this operational process** to keep `docs.json` navigation and MDX targets coherent.

## Generated StackKits release pages

StackKits application pages under `stackkits/apps/` are authored in this repository. The former generated service guides under `guides/stackkits/services/` and their `generated-stackkit-docs.yml` refresh are retired; `docs.json` redirects the old URLs.

`.github/workflows/stackkits-release-docs.yml` projects the generated StackKits pages from published StackKits releases:

1. The workflow runs after the `stackkits-docs-release` repository-dispatch event, on a weekly schedule, or manually for one tag; without a tag it reconciles the public latest release.
2. It downloads the release's immutable documentation assets from the public StackKits repository and renders `data/stackkits/`, `stackkits/reference/use-case-catalog.mdx`, `stackkits/reference/os-compatibility.mdx`, `stackkits/reference/application-delivery-compatibility.mdx`, and the CLI reference under `stackkits/reference/cli/` together with its `docs.json` navigation group.
3. Generated pages carry provenance front matter: `generated: true`, `generated_by`, `content_hash`, and `source_hash`.
4. It stages only those paths and opens a pull request with auto-merge enabled.

The accompanying `.github/workflows/parity-gate.yml` runs on pull requests that change those pages, `data/stackkits/`, or `stackkits/apps/`. For files marked `generated: true` it validates the required provenance fields and the expected generator identifiers (`stackkit docs sync-release-manifests`, `stackkit docs emit-cli-reference`); a human-authored commit is warned rather than automatically rejected.

This generated boundary **protects a subset of** [StackKits documentation map](stackkits.md). Before editing a StackKits reference page, inspect its front matter: generated output is fixed in the StackKits release source, not by hand here.

## Changelog and maturity context

`changelog/overview.mdx` is the public dated product-update record. It is useful evidence for how StackKits terminology, kit status, release channels, and recent fixes evolved. Recent history reinforces that role:

- Commit `4ac7ce3` added Cloud Kit and the use-case lifecycle pages.
- Commit `348812b` added a dated StackKits changelog entry.
- Subsequent commits added later changelog entries and adjusted generated-doc workflow dependencies.

Use the changelog to understand chronology, not as a shortcut around present-day source verification. The current StackKits hierarchy contains older and newer terminology and support claims that do not fully agree; [StackKits documentation map](stackkits.md#support-and-freshness-caveats) identifies the most visible inconsistencies.

The changelog also **supplies maturity context for** [Identity & Access map](identity-access.md), but identity architecture retains its own explicit statement that live per-domain enforcement status is not publicly published.

## Scheduled workflows

| Workflow | Trigger / purpose | Maintainer implication |
| --- | --- | --- |
| `.github/workflows/stackkits-release-docs.yml` | `stackkits-docs-release` repository dispatch, weekly schedule, or manual tag; opens an auto-merge PR with the generated StackKits pages. | Change the StackKits release source, not the generated output. |
| `.github/workflows/parity-gate.yml` | Pull requests changing StackKits application pages or generated StackKits pages. | Generated pages need expected provenance fields and generator identifiers. |

OpenWiki generation itself is not a repository workflow: the `openwiki/` tree is refreshed by the workspace-root `mise run openwiki:update mintlify-docs` task under a local subscription, and the generated content is committed for Git review restricted to `openwiki/`.

## Practical maintenance checklist

1. Start with [OpenWiki quickstart](quickstart.md) to confirm authority and scope.
2. Identify whether the target MDX is authored content or a generated StackKits release page.
3. For public navigation changes, update the page and `docs.json`, then run `mise run check`; use `mise run local:e2e` before publication according to `README.md`.
4. For StackKits product claims, compare source pages with the newest relevant changelog context and verify against the external StackKits source repository when needed.
5. Keep credentials, restricted operations, and internal material out of this public repository and out of generated OpenWiki pages.
6. Refresh this OpenWiki after meaningful repository changes; the charter specifies the workspace-root `mise run openwiki:update mintlify-docs` route.

## Related concepts

- [Site and publication model](site-publication.md) — the validation and navigation behavior this workflow protects.
- [StackKits documentation map](stackkits.md) — product surface and generated release-page caveat.
- [Identity & Access map](identity-access.md) — identity source layers and maturity language.
- [OpenWiki quickstart](quickstart.md) — authoritative source order and deferred areas.
