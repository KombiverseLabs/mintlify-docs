# CLAUDE.md - mintlify-docs

Follow `AGENTS.md`; this file only adds Claude task routing.

## Route by task

- Public page or navigation: read `docs.json`, `public-safety-policy.json`, and
  the owning product's public release evidence.
- Documentation policy or localization: read the relevant workspace
  `DOCUMENTATION-STANDARD.md` or `LANGUAGE-LOCALIZATION-STANDARD.md`; do not
  copy workspace standards into MDX.
- Publication or live verification: run `mise run check`,
  `mise run local:e2e`, and the exact-source delivery gates in `AGENTS.md`.
- Planning: use GitHub Projects for cross-repo portfolio decisions,
  `ROADMAP.md` for milestones, and Beads for executable work.

Keep the anonymous public boundary and release evidence intact. Completion
requires the relevant gates, a commit, and a successful push.
