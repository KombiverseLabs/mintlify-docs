# Guide screenshots

This tool captures reproducible screenshots for client setup guides. A
scenario starts a local reference install in Docker, fills it with synthetic
data, and drives the web UI with Playwright. Each named step is saved as a
WebP image, together with a `captures.json` manifest. The rules for using the
images are in [`docs-guidelines/client-setup-guides.md`](../../docs-guidelines/client-setup-guides.md).

## Run

Requirements: Node 24 (from the repository's `mise`) and Docker with Compose
v2.

```bash
cd scripts/guide-screenshots
npm ci
npx playwright install chromium   # first run only
node capture.mjs passwords-vaultwarden
```

Options:

- `--keep`: leave the containers running afterwards so you can inspect them.
  Remove them with `docker compose -f apps/<app>/compose.yaml down -v`.
- `--no-docker`: capture against an instance that is already running. Pass
  the same per-run secrets as environment variables, such as
  `GUIDE_ADMIN_TOKEN`.
- `--scheme dark`: capture in the dark color scheme. Files get a `-dark`
  suffix.

The run writes to `images/guides/<use-case>/<app>/`:

- `<platform>-<NN>-<slug>.webp`: 2x device pixels, at most 1600 px wide;
- `captures.json`: app and UI versions, capture date, viewport, synthetic
  account, and for each image its size, alt text and annotation boxes in
  percent.

Copy the `width`, `height` and `annotations` values from `captures.json` into
the guide's `screenshot` props. The annotation numbers are the click-list
numbers that the scenario assigned.

## How it works

- `apps/<app>/compose.yaml` is the reference install. It pins the same image
  the StackKits catalog delivers where one exists, and it serves the example
  hostname (for example `vault.home.test`) over HTTPS through Caddy with a
  throwaway internal CA on a loopback port.
- Chromium maps the example hostname to that port
  (`--host-resolver-rules`). The UI then runs at its real example address
  with a secure context, and no system DNS or hosts file changes.
- `scenarios/<name>.mjs` exports `useCase`, `app`, `compose`, `hosts`,
  `secrets` (names of per-run random values) and `run({ page, shot, env })`.
  `shot(name, { clip, pad, annotate, alt })` crops to the given elements and
  records annotation boxes for the listed targets. A target is a selector, a
  Playwright locator, or `{ n, target }` when the marker number must match a
  specific click-list item.
- WebP encoding uses Chromium's canvas encoder, so the tool has no image
  library dependency.
- All data is synthetic (`alex@example.com`, "Example Shop"). Secrets are
  random per run and discarded, and the instance is deleted after the run.

## Add a scenario

1. Add `apps/<app>/compose.yaml` with the catalog image, an example hostname,
   and volatile storage.
2. Add `scenarios/<use-case>-<app>.mjs`. Explore the UI once with `--keep`,
   then prefer role- and label-based locators (`getByRole`, `getByLabel`)
   over CSS classes, so the scenario survives UI restyling.
3. Run it, review every image, and check the images and `captures.json` in
   with the guide change.

## Mobile apps

Phone apps cannot be captured this way. Until a mobile capture lane exists,
guides link to the vendor's page for mobile-only screens, as the Passwords
guide does for the Bitwarden app. The planned approach:

- **Android**: an Android emulator (`emulator` from the Android SDK) with a
  clean system image, the app installed from its official store or
  repository, and captures via `adb exec-out screencap -p`. The emulator
  reaches the reference install through `10.0.2.2` and a hosts entry for the
  example hostname. The throwaway CA must be trusted on the device (some
  apps ignore user-installed CAs, so check this per app).
- **iOS**: the Xcode Simulator (`xcrun simctl io booted screenshot`). Only
  apps that ship a simulator build can be captured this way; App Store apps
  otherwise need a physical test device.
- Convert the PNG output with the same WebP settings (1600 px maximum width)
  and store it as `ios-NN-*.webp` or `android-NN-*.webp`, with a
  hand-written entry in `captures.json`.
