# Kombify task context

Follow the current checkout's `AGENTS.md`. This compact startup context replaces
Beads' generic workflow and bulk memory dump; it is not another policy source.

- Inspect only the task-relevant issue: `bd show <id>`, `bd search <term>`, or
  `bd ready`. Search historical knowledge with `bd memories <keyword>` when useful;
  verify old claims against current source and tracker state.
- GitHub Projects owns portfolio decisions; repository Beads owns executable work.
- Resolve the workspace root and manifest repository ID before a write. Run all
  mutations through `mise --cd <workspace-root> run beads:write --repo <id> --
  <mutation>`. Require `BEADS_REMOTE_WRITE_OK` before claiming persistence.
- If publication fails, preserve the local mutation and use `beads:publish`;
  never repeat the mutation. Do not invoke direct Dolt pushes as a separate
  session-close ritual.
- Run the affected gate, preserve unrelated work, and follow `AGENTS.md` Git
  Persistence and Session Completion for the authorized PR/merge workflow.
- If the remote tracker or required checkout is unavailable, finish independent
  authorized work and report the exact missing step. Do not initialize a second
  tracker or claim an offline export is remotely persisted.
