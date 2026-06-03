# kombify Public Docs

Tier-1 public documentation for kombify, built with Mintlify and configured by `docs.json`.

## Current Surface

- Guides entrypoint: `index.mdx`
- StackKits documentation under `stackkits/`
- StackKits service guides under `guides/stackkits/services/`
- Global navigation and branding in `docs.json`

## Local Development

```powershell
mise run dev
```

or run Mintlify directly:

```powershell
npx mint@latest dev
```

## Validation

```powershell
mise run check
mise run local:e2e
```

The local E2E script validates `docs.json`, verifies navigation page targets, and runs Mintlify broken-link checks when the Mintlify CLI path is available through `npx`.

## Standards

- Public docs stay in this repo.
- Internal architecture and standards stay in `../kombify-Core/internal-docs/` and `../kombify-Core/standards/`.
- Repo-local implementation docs stay in each product repo's `docs/` folder.
- Do not publish secrets, internal operator URLs, Doppler paths with secret values, or customer/private data.

## Key Files

- `STATUS.md` - current state.
- `ROADMAP.md` - public docs roadmap.
- `AGENTS.md` / `CLAUDE.md` - AI-agent instructions.
- `docs.json` - Mintlify navigation and site configuration.
