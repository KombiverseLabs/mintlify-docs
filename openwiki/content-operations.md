---
type: Documentation Operations Guide
title: Content operations and generated documentation
description: How authored public MDX, generated StackKits service guides, changelog updates, Git review, and scheduled workflows are maintained in mintlify-docs.
tags: [documentation-operations, generated-content, github-actions, changelog, stackkits]
---

# Content operations and generated documentation

> **Generated against:** `fc905e821407cc6f74f0252d7724a9a4dcd7cf81`

## Authoring and review boundary

`README.md` defines this repository as the public documentation surface and requires source-verified content. `CONTRIBUTING.md` offers general contribution advice, but it appears template-derived and refers to a missing `development.mdx`; rely on `README.md`, `mise.toml`, and current scripts for operational commands.

All content changes should remain public-safe, reviewable in Git, and validated with the local checks in [site and publication model](site-publication.md#local-checks). That publication model **depends on this operational process** to keep `docs.json` navigation and MDX targets coherent.

## Generated StackKits service guides

The directory `guides/stackkits/services/` is not ordinary hand-authored content by default. `.github/workflows/generated-stackkit-docs.yml` refreshes it through a StackKits registry snapshot and emitter workflow:

1. The workflow runs manually, on a daily schedule, or after the `stackkit-tool-content-published` repository-dispatch event.
2. It checks out the external StackKits emitter repository, obtains a registry snapshot, and emits Mintlify content into `guides/stackkits/services/`.
3. It requires generated pages to include provenance front matter: `generated: true`, `generated_by`, `content_hash`, and `source_hash`.
4. It stages only the service-guide directory and opens a pull request for review when content changes.

The accompanying `.github/workflows/parity-gate.yml` runs on pull requests that change that directory. It validates required provenance fields and the expected generator identifier for files marked `generated: true`; a human-authored commit is warned rather than automatically rejected.

This generated boundary **protects a subset of** [StackKits documentation map](stackkits.md). Before editing a service page, inspect its front matter and its generation workflow. Do not casually hand-edit generated output without understanding whether the source registry/emitter should be changed instead.

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
| `.github/workflows/generated-stackkit-docs.yml` | Manual, daily, or repository-dispatch refresh of generated service guides; opens a PR. | Review generated provenance and the limited service-guide scope. |
| `.github/workflows/parity-gate.yml` | Pull requests changing StackKits service guides. | Generated pages need expected provenance fields. |
| `.github/workflows/openwiki-update.yml` | Manual or daily OpenWiki update; installs OpenWiki and opens an update PR. | Generated wiki content is intended for Git review; the workflow’s add-path includes broader files, but the repository charter restricts normal wiki generation to `openwiki/`. |

The checkout also has uncommitted changes to `AGENTS.md`, `CLAUDE.md`, and an untracked OpenWiki workflow, plus two unexpected untracked paths reported by the local `git status`. These are not part of the generated wiki source of truth and should be accounted for separately before any broad commit or cleanup.

## Practical maintenance checklist

1. Start with [OpenWiki quickstart](quickstart.md) to confirm authority and scope.
2. Identify whether the target MDX is authored content or a generated service guide.
3. For public navigation changes, update the page and `docs.json`, then run `mise run check`; use `mise run local:e2e` before publication according to `README.md`.
4. For StackKits product claims, compare source pages with the newest relevant changelog context and verify against the external StackKits source repository when needed.
5. Keep credentials, restricted operations, and internal material out of this public repository and out of generated OpenWiki pages.
6. Refresh this OpenWiki after meaningful repository changes; the charter specifies the workspace-root `mise run openwiki:update mintlify-docs` route.

## Related concepts

- [Site and publication model](site-publication.md) — the validation and navigation behavior this workflow protects.
- [StackKits documentation map](stackkits.md) — product surface and generated service-guide caveat.
- [Identity & Access map](identity-access.md) — identity source layers and maturity language.
- [OpenWiki quickstart](quickstart.md) — authoritative source order and deferred areas.
