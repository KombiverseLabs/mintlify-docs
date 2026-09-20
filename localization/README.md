# Public documentation localization

English `index.mdx` remains the canonical source. Mintlify owns the reader-facing
language switch and locale-aware fixed chrome. The platform locale `zh-Hans` is
projected to Mintlify's supported `cn` language code only at this adapter boundary.

The non-English Start pages are machine-assisted review candidates. They are not
human-reviewed rollout evidence and must not be described as verified. Human review
and exact-source DSSE evidence remain external release requirements.

At publication, enable Mintlify's **Auto-route to preferred language** add-on and
verify it against the exact deployed revision. The native switch remembers an
explicit visitor choice; every non-English navbar also exposes a direct `EN` action.
Do not activate auto-routing while these candidate catalogs remain unreviewed.

Run `mise run localization:check` after changing the source page, language navigation,
or a candidate. The manifest binds every candidate to the current English source hash
so source drift fails closed.
