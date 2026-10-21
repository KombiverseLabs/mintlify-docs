#!/usr/bin/env node
// Capture unchanged vendor clients through their normal UI. Never patches the
// app, disables certificate checks, or changes the host/browser profile.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const pins = JSON.parse(readFileSync(join(here, 'vendor-clients.json')));
const [command, ...args] = process.argv.slice(2);
const cache = process.env.GUIDE_ARTIFACT_CACHE || join(tmpdir(), 'kombify-guide-vendor-clients');
mkdirSync(cache, { recursive: true });
const digest = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
async function artifact(name) {
  const pin = pins.find((entry) => entry.name === name);
  if (!pin || !pin.browser_download_url.startsWith(`https://github.com/${pin.repository}/releases/download/${pin.tag}/`)) throw Error('Unregistered vendor artifact');
  const target = join(cache, name);
  let bytes;
  try { bytes = readFileSync(target); } catch {
    const response = await fetch(pin.browser_download_url);
    if (!response.ok) throw Error(`Vendor download HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (digest(bytes) !== pin.digest) throw Error(`Vendor digest mismatch: ${name}`);
  writeFileSync(target, bytes);
  return target;
}
async function webp(page, png, target) {
  const result = await page.evaluate(async (data) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const scale = Math.min(1, 1600 / image.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL('image/webp', 0.86);
    if (!encoded.startsWith('data:image/webp')) throw Error('WebP encoder unavailable');
    return { width: canvas.width, height: canvas.height, data: encoded.split(',')[1] };
  }, png.toString('base64'));
  const bytes = Buffer.from(result.data, 'base64');
  mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
  return { width: result.width, height: result.height, bytes: bytes.length, sha256: digest(bytes) };
}
if (command === 'download') {
  for (const pin of pins) { await artifact(pin.name); console.log(`${pin.name}: verified ${pin.digest}`); }
} else if (command === 'browser') {
  const work = mkdtempSync(join(tmpdir(), 'kombify-guide-bitwarden-'));
  const extension = join(work, 'extension'); mkdirSync(extension);
  execFileSync('unzip', ['-q', await artifact('dist-chrome-2026.10.0.zip'), '-d', extension]);
  // A normal headed browser is necessary for this release's extension startup.
  // On a headless Linux host run through xvfb-run; no real profile is reused.
  const context = await chromium.launchPersistentContext(join(work, 'profile'), {
    channel: 'chromium', headless: false, locale: 'en-US', colorScheme: 'light',
    viewport: { width: 700, height: 900 }, deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2]; const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup/index.html?uilocation=popup`);
    await page.getByRole('button', { name: 'Skip', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('button', { name: 'bitwarden.com', exact: true }).click();
    await page.getByText('self-hosted', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Server URL', exact: true }).fill('https://vault.home.test');
    const png = await page.getByRole('dialog').screenshot();
    console.log(await webp(page, png, join(repo, 'images/guides/passwords/bitwarden/browser-01-server.webp')));
  } finally { await context.close(); rmSync(work, { recursive: true, force: true }); }
} else if (command === 'android') {
  // Use the exact launcher/config/session returned by T3 device_open. It is
  // deliberately caller-supplied; never selects a device or installs a CA.
  const [launcher, config, session, serial, packageName, relativeOutput] = args;
  if (!launcher || !config || !session || !serial || !['app.alextran.immich', 'com.x8bit.bitwarden'].includes(packageName)
    || !/^images\/guides\/(photos\/immich|passwords\/bitwarden)\/android-\d\d-[a-z-]+\.webp$/.test(relativeOutput || '')) throw Error('Supply launcher, config, session, serial, package and owned image path');
  const work = mkdtempSync(join(tmpdir(), 'kombify-guide-android-'));
  const browser = await chromium.launch({ headless: true });
  try {
    const adb = process.env.GUIDE_ADB || 'adb';
    const foreground = () => execFileSync(adb, ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities'], { encoding: 'utf8' }).split('\n').filter((line) => /mResumedActivity|topResumedActivity/.test(line)).join('\n');
    if (!foreground().includes(packageName)) throw Error('Requested vendor app is not in the foreground');
    const png = join(work, 'screen.png');
    execFileSync(launcher, ['screenshot', png, '--platform', 'android', '--serial', serial, '--config', config, '--session', session], { stdio: 'inherit' });
    if (!foreground().includes(packageName)) throw Error('Foreground changed during capture; discard the image');
    const page = await browser.newPage(); console.log(await webp(page, readFileSync(png), join(repo, relativeOutput)));
  } finally { await browser.close(); rmSync(work, { recursive: true, force: true }); }
} else throw Error('usage: vendor-clients.mjs download | browser | android <launcher> <config> <session> <serial> <package> <relative-image-path>');
