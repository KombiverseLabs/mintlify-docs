# Kombify task context

Follow this checkout's AGENTS.md. Cloudflare is the operational Beads authority
(owner decision 2026-10-08); Dolt is read-only comparison/performance data.

- On a new host or clone run `node scripts/beads-cloudflare-access.mjs` and
  require `BEADS_CLOUDFLARE_ACCESS_OK`. Access uses the host's GitHub identity or
  approved CI OIDC; no manual Cloudflare key copying. Install the pinned native
  Cloudflare-capable bd with `node scripts/beads-session-tools.mjs`.
- Read focused tasks with `bd show <id>`, `bd ready`, `bd search <term>` or
  `bd memories <keyword>`. Beads epics own cross-repo priorities; each
  product `ROADMAP.md` owns its milestones.
- Mutate only through `mise --cd <workspace-root> run beads:write --repo
  mintlify-docs -- <mutation>`. Require `BEADS_REMOTE_WRITE_OK ...
  tracker=cloudflare` after independent remote readback.
- An interrupted write may already have committed. Preserve its acknowledged
  IDs and inspect remote state; never replay an uncertain mutation.
- Never fall back to Dolt or `.beads/issues.jsonl`, initialize another tracker,
  or repair Cloudflare from a stale Dolt comparison snapshot.
- Follow the [Beads Cloudflare Standard](https://github.com/KombiverseLabs/kombify-workspace/blob/main/BEADS-REMOTE-WRITE-STANDARD.md).
  Missing access or a failed operation remains an explicit blocker.
