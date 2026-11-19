# Changelog pages

Contributor guidance, excluded from the site by `.mintignore`. The customer
changelog stays in this repository (decision O16 of the product loop program,
D-2026-10-22-09; public docs live here per D-2026-07-27-01). Its release text
has one source: the highlights file of each release in the product repository,
`.kombify/release-highlights/<version>.md`. Nobody writes a release entry or a
weekly digest by hand.

## Structure

| Page | Holds | Written by |
| --- | --- | --- |
| `changelog/overview` | The index of the product changelogs, one line per product with a link to it | Nobody; hand-written |
| `changelog/<product>` for `stackkits`, `homelab`, `speechkit`, `cloud` | The hand-written weekly updates of that product up to 2026-10-30, kept as history, and above them one `<Update>` per release, tagged `Stable` or `Early Access`, and one per ISO week, tagged `Weekly digest`, newest first | The history: nobody, frozen. The entries: `kombify-workspace/scripts/release-notes.mjs` |

Every product keeps its own changelog, so a reader of one product finds the
changes of that product only. The index keeps its old URL, so every link to it
still works.

A product page does not exist until its first entry. The frozen weekly updates
of StackKits, Homelab and SpeechKit are its first entries, and the first
`changelog-entry` of kombify Cloud creates its page, its `docs.json` navigation
entry and its `public-safety-policy.json` allowlist entry together with that
entry (`--init` creates only the three, without an entry). The script owns the
frontmatter and the sentence under it of every product page, so a renamed
product or a changed sentence does not stay behind; everything below that
header stays where it is.

- Each entry sits between `{/* release-notes:begin ... */}` and
  `{/* release-notes:end ... */}` comments; the script finds, replaces and
  orders entries by these markers and leaves any text you add around them
  alone. Edit a release by changing its highlights file in the product
  repository and running the script again, never the entry.
- A new entry goes on top of the page, above the older entries and above the
  frozen history.
- A release entry has the label `v<version>` (anchor `#v<major>-<minor>-<patch>`,
  which the GitHub Release body links to) and the release date as description.
  Promoting an Early Access release to Stable re-runs the script with
  `--channel stable`, which changes the tag of the same entry.
- A digest has the label `Week <iso-week>` and lists the week's highlights,
  shortened, with the limits kept and a link to each release entry.
- The product pages use the default page mode, because the `center` mode hides
  Mintlify's tag filters; each page also publishes an RSS feed.
- English is the source. The other locales arrive through the translation job
  and are reported as pending until then; a page never waits for them. A
  locale lists only the products that have a page in that locale.

## Run it

From the workspace checkout, with this repository as the docs root:

```text
node scripts/release-notes.mjs changelog-entry --product <id> --version <v> --channel stable|early-access --docs-root <this checkout>
node scripts/release-notes.mjs digest --product <id> --week <YYYY-Www|last> --docs-root <this checkout>
node scripts/release-notes.mjs --check --docs-root <this checkout>
```

The releasing session runs `changelog-entry` after a Stable release and the
Monday issue-train run runs `digest --week last`; both publish the pull request
(`kombify-ship` step 7, `internal/development/issue-train-routine.md` step 4 in
the workspace). `--dry-run` prints the diff and writes nothing; read it as a
public reader would before the real run. The script refuses highlights that name
a tracker id, an internal repository, tool or host, an e-mail address, a commit
link, a GitHub owner other than `kombifyio` or an unfilled placeholder, or that
contain a credential shape; fix the highlights file in the product repository.
Then run `mise run check`.
