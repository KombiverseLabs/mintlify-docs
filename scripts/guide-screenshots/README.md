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

## Mobile apps

Not capturable yet; guides link the vendor page for mobile-only screens. Planned:

- **Android**: emulator with a clean system image, app from its official store
  or repository, `adb exec-out screencap -p`; the emulator reaches the
  reference install via `10.0.2.2` plus a hosts entry, and must trust the
  throwaway CA (some apps ignore user CAs; check per app).
- **iOS**: Xcode Simulator (`xcrun simctl io booted screenshot`); only apps with
  a simulator build, otherwise a physical device.
- Convert PNG to WebP with the same settings, store as `ios-NN-*.webp` or
  `android-NN-*.webp`, with a hand-written `captures.json` entry.
