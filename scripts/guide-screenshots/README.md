# Guide screenshots

Reproducible screenshots for client setup guides. A scenario starts a local
reference install in Docker, fills it with synthetic data and drives the web UI
with Playwright; each named step is saved as WebP plus a `captures.json`
manifest. Usage rules:
[`docs-guidelines/client-setup-guides.md`](../../docs-guidelines/client-setup-guides.md).

## Run

Needs Node 24 (repository `mise`) and Docker with Compose v2.

```bash
cd scripts/guide-screenshots
npm ci
npx playwright install chromium   # first run only
node capture.mjs passwords-vaultwarden
```

- `--keep`: leave the containers running (remove with
  `docker compose -f apps/<app>/compose.yaml down -v`).
- `--no-docker`: capture an already running instance; pass the per-run secrets
  as environment variables, such as `GUIDE_ADMIN_TOKEN`.
- `--scheme dark`: dark color scheme; files get a `-dark` suffix.

Output in `images/guides/<use-case>/<app>/`: `<platform>-<NN>-<slug>.webp` (2x
device pixels, at most 1600 px wide) and `captures.json` (app and UI versions,
capture date, viewport, synthetic account, per image size, alt text and
annotation boxes in percent). Copy `width`, `height` and `annotations` into the
guide's `screenshot` props; annotation numbers are the scenario's click-list
numbers.

## How it works

- `apps/<app>/compose.yaml` is the reference install: the same image the
  StackKits catalog delivers where one exists, served at the example hostname
  (e.g. `vault.home.test`) over HTTPS through Caddy with a throwaway internal CA
  on a loopback port.
- Chromium maps the hostname to that port (`--host-resolver-rules`): real
  example address, secure context, no system DNS or hosts changes.
- `scenarios/<name>.mjs` exports `useCase`, `app`, `compose`, `hosts`, `secrets`
  (names of per-run random values) and `run({ page, shot, env })`.
  `shot(name, { clip, pad, annotate, alt })` crops to the given elements and
  records annotation boxes; a target is a selector, a Playwright locator, or
  `{ n, target }` to pin the marker number to a click-list item.
- WebP uses Chromium's canvas encoder (no image library dependency).
- Data is synthetic (`alex@example.com`, "Example Shop"); secrets are random
  per run and discarded; the instance is deleted after the run.

## Add a scenario

1. `apps/<app>/compose.yaml`: catalog image, example hostname, volatile storage.
2. `scenarios/<use-case>-<app>.mjs`: explore once with `--keep`; prefer
   `getByRole` and `getByLabel` over CSS classes.
3. Run it, review every image, commit images and `captures.json` with the guide.

## Official Android clients and browser extension

`vendor-clients.json` pins official Immich Android v2.7.0 (matching the released
StackKits image), Bitwarden Android 2026.10.0 and the Bitwarden browser extension
2026.10.0. Every download must match the GitHub release asset SHA-256 digest.
Run `node vendor-clients.mjs download` to verify them before installation.

Use T3 `device_list` and `device_open` to select an available Android emulator.
Keep the returned exact agent-device launcher, config, serial and session on
every operation. Preserve other apps and media. Drive the unchanged client
through its normal UI. Bitwarden's own **App settings → Other → Allow screen
capture** setting and confirmation permit screenshots; no instrumentation or
app patch is needed. Restore the setting, or uninstall only the app installed
for this capture, when finished. iOS remains a vendor link card.

`node vendor-clients.mjs android <launcher> <config> <session> <serial>
<package> <relative-image-path>` captures the foreground app, converts PNG to
WebP and reports dimensions and digest. Pass `GUIDE_ADB` when adb is not on
PATH. Inspect the image before adding it: a Back action can leave the app,
and a successful screenshot command is not visual proof.

For the extension use `xvfb-run -a node vendor-clients.mjs browser` on a headless
Linux host, or `node vendor-clients.mjs browser` on a desktop. It uses the normal
headed Chromium extension UI, skips the default-password-manager prompt and
captures the self-hosted dialog with an example address. Its browser profile is
temporary. `npx playwright install chromium` installs the browser for the pinned
driver. No personal browser profile or real vault account is used.

## Immich reference

`apps/immich/compose.yaml` runs unchanged upstream Immich and its native
persistence on an admitted real test server. It is not a substitute for a
Kombify database. Follow workspace development-probe admission and access
preflight, qualify server capacity, use a unique project and loopback-only
ports, and preserve all foreign workloads. Generate the database password per
run without logging it. The reference excludes machine learning and uses the
released server, database and cache image digests.

Use the normal web registration/onboarding and app login with a synthetic
account and an owned example image. Forward only the owned loopback port to
the emulator. Use a controlled media library containing only the owned test images; never
capture or upload another fixture's media. The October 21 captures show the normal Android album
and backup flow and web readback, not a StackKits rollout or recovery test.
Delete only this Compose project's containers, volumes and temporary secrets,
its port forward and owned media after capture. Do not remove cached image
layers another session may now use.

For each image, retain the app version, release and verified artifact digest,
viewport, synthetic-data description, dimensions, image digest and visual review
in `captures.json`. Do not save credentials or authentication state there.

## Verify the native MDX reader

After a guide structure change, start the pinned preview with `mise run dev`,
then run this bounded browser journey from this directory:

```bash
node verify-client-guides.mjs --base-url http://localhost:3000 --output-dir /absolute/path/to/ignored/evidence
```

It opens a fresh browser context, follows a native step hash in both guides in
all six locales, and asserts that the target step is visible. It also checks
all steps in the browser's print layout and writes one PDF per English guide
for visual review. It closes its own browser. This is a reader regression,
not hosted Markdown or Mint search acceptance: after publication, fetch all
12 canonical `.md` exports and use the real Mint search dialog to confirm that
instruction queries return results which open visible steps. Local preview
routes and text found in a page body do not prove hosted exports or indexing.
