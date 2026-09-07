# Kombify Beads tracker

The owning Dolt remote is the collaboration authority. The local embedded Dolt
store is a working copy. Git-tracked issues.jsonl files are derived exports;
never use them to decide current task status, initialize a second tracker, or
restore an old export over a current database.

Read focused tasks with bd show <id>, bd search <term>, or bd ready. Workspace
fleet reports resolve the manifest's Git owners and redirects, then read the
Dolt working copies. Missing stores fail the report; an offline export is not
a successful fallback. beads:fleet checks local schema and remote-tracking
history; remote writes require the publish/read-back receipt below.

Run mutations through the owning workspace:

```powershell
mise --cd <workspace-root> run beads:write --repo mintlify-docs -- update <id> --status in_progress
mise --cd <workspace-root> run beads:write --repo mintlify-docs -- close <id>
```

Success requires BEADS_REMOTE_WRITE_OK. If publishing fails, preserve the
mutation and run beads:publish --repo mintlify-docs; never repeat a create.
Fresh checkouts adopt the existing remote through beads:bootstrap. Only the
designated canonical migrator upgrades a shared schema.

See [Beads Remote Write Standard](https://github.com/KombiverseLabs/kombify-workspace/blob/main/BEADS-REMOTE-WRITE-STANDARD.md) for routing,
recovery, schema migration and lossless reconciliation. Install the checkout's
hook guard before its first Beads operation. The guard's legacy compatibility
branch does not authorize a local-only tracker for an active repository.
