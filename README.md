# kombify Public Docs

Tier-1 public documentation for kombify, built with Mintlify and configured by `docs.json`.

## Current Surface

- Platform authority pages under `platform/`
- AI, support, and journey authority pages under `ai/`, `support/`, and `journeys/`
- StackKits documentation under `stackkits/` and `guides/stackkits/`
- Identity reference pages under `identity/`
- Global navigation and redirects in `docs.json`

## Local Development

```powershell
mise run dev
```

or run Mintlify directly:

```powershell
npx -y mint@4.2.684 dev
```

## Audience workflow

Normal public documentation updates can merge independently. Future public
pages may merge as restricted review content for authenticated Mintlify
organization members and be reviewed on the same live Mintlify site.
Publication is a small, reviewable navigation/frontmatter change from
`audience: organization-members` to `public: true`.

Mintlify partial authentication keeps public `llms.txt`, MCP, and search
results limited to public pages. Access control is not permission to store
secrets, private customer data, or internal operational detail in this
repository.

## Validation

```powershell
mise run check
mise run local:e2e
```

The local E2E script validates `docs.json`, audience boundaries, navigation
targets, internal links, redirect targets, orphan pages, and runs bounded local
runtime HTTP smoke checks for both public and restricted routes. Mint's local
server does not enforce provider authentication, so `local_auth_not_enforced`
is expected when the restricted marker renders and does not prove authenticated
member access. The binding anonymous leak check runs against the exact PR
preview and deployed `main` deployment in CI and remains red until Mintlify
authentication is activated. `mint broken-links` is available as an advisory
task (`mise run links:advisory`), not a blocking gate.

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
