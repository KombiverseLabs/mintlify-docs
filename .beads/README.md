# Kombify Beads tracker

Cloudflare is the operational tracker authority. This repository carries its
non-secret binding in `.kombify/beads-cloudflare.json`; bootstrap materializes
`.beads/metadata.json` and `.beads/cloudflare.json` for the native bd backend.

```sh
node scripts/beads-session-tools.mjs
node scripts/beads-cloudflare-access.mjs
bd ready
mise --cd <workspace-root> run beads:write --repo mintlify-docs -- update <id> --status in_progress
```

Require `BEADS_CLOUDFLARE_ACCESS_OK` from setup and `BEADS_REMOTE_WRITE_OK ...
tracker=cloudflare` after a mutation. The writer verifies the independent remote
readback. If a request was interrupted, inspect its outcome before further work;
never replay an uncertain mutation.

The host's GitHub identity or approved CI OIDC obtains short-lived tracker access.
No private Cloudflare key, personal vault or original checkout is needed. A new
host needs an authorized identity and the checksum-pinned Cloudflare-capable bd.

Dolt data remains only for explicit read-only comparison and performance
measurements. `dolt-comparison.json` preserves host-local metadata for that data.
Neither this snapshot nor `issues.jsonl` is an operational fallback.

Connector-only agents use the existing GitHub Beads bridge and its approved
owner-local workflow. A merged request is not a tracker execution receipt.

See [Beads Cloudflare Standard](https://github.com/KombiverseLabs/kombify-workspace/blob/main/BEADS-REMOTE-WRITE-STANDARD.md) for setup,
remote access, recovery, migration ordering and evidence requirements.
