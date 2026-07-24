# OpenWiki charter: mintlify-docs

Status: generated against `fc905e821407cc6f74f0252d7724a9a4dcd7cf81` (init, 2026-07-24 UTC) by the local subscription automation. Scope, classification, and cadence are governed by the workspace HANDOFF-OPENWIKI.md and repo-manifest.json.

Authority: `kombify-Core/standards/CODE-INTELLIGENCE-STANDARD.md` section 2a; the current version in the workspace checkout governs.

## Repository role

Canonical public documentation and API reference.

Lifecycle: active.

Owner team: `docs`. Manifest type: `mintlify-docs`.

## What this wiki is

Agent-facing documentation that explains and connects what the repository
already documents. It is generated, reviewed through Git, and never a source of
truth. On any conflict the authoritative documents below win, and the wiki is
wrong and must be regenerated.

## Authoritative sources, in priority order

- `README.md`
- `STATUS.md`
- `ROADMAP.md`
- Workspace standards, linked from those files. Link to them; never restate
  platform strategy, entitlement, identity, release, or planning policy here.
- The current checkout. Where indexed results and the checkout disagree, the
  checkout wins.

Ground claims in `codeintel_search`, `codeintel_repo_overview`,
`codeintel_dependencies`, and `codeintel_decisions` where the
`kombify-tools` MCP surface is reachable, and cite file paths.

## Hard constraints

- Write only inside `openwiki/`. Never create or modify `AGENTS.md`,
  `CLAUDE.md`, `README.md`, `STATUS.md`, `ROADMAP.md`, or any other file
  outside this directory.
- English only.
- No secrets, credentials, tokens, or secret names.
- Never present retired systems as current: `kombify-Desk`, a standalone
  `kombify-MCP` repository, legacy `kombify-AI`, RepoWise, Kong, or ToolHive
  as a product. Successors: Notifications and Central, Gateway, AI Platform,
  `codeintel`.
- Product display names are not repository names. Canonical: StackKits,
  Techstack, Kombify Cloud, Kombify AI, Kombify Workbench, Kombify Companion,
  SpeechKit. The customer MCP connector displays as "Kombify".
- Do not state a capability as present unless the code shows it. Planned work
  belongs to `ROADMAP.md`, not here.

## Freshness

Each generated document records the full commit SHA it was generated against.
Refresh through `mise run openwiki:update mintlify-docs` from the workspace root
when the repository changes outside `openwiki/`.
