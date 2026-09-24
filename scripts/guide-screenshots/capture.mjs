#!/usr/bin/env node
// Captures client setup guide screenshots from a local reference install.
//
//   node capture.mjs <scenario> [--keep] [--no-docker] [--no-android] [--scheme light|dark]
//
// A scenario (scenarios/<name>.mjs) names its Docker Compose file, the example
// hostnames it serves, optional browser extensions and Android apps (pinned
// vendor release assets), and a `run` function that drives the apps with
// synthetic data and calls `shot()` / `android.shot()` for each named step.
// Images land in images/guides/<use-case>/<app>/<platform>-<NN>-<slug>.webp;
// images/guides/<use-case>/captures-<scenario>.json records versions, sizes and markers.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { releaseAsset } from './lib/artifacts.mjs';
import { androidAvailable, bootEmulator } from './lib/android.mjs';

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, '..', '..');

const args = process.argv.slice(2);
const scenarioName = args.find((arg) => !arg.startsWith('--') && !['light', 'dark'].includes(arg));
const keep = args.includes('--keep');
const useDocker = !args.includes('--no-docker');
const useAndroid = !args.includes('--no-android');
const schemeIndex = args.indexOf('--scheme');
const scheme = schemeIndex >= 0 ? args[schemeIndex + 1] : 'light';
if (!scenarioName || !['light', 'dark'].includes(scheme)) {
  console.error('usage: node capture.mjs <scenario> [--keep] [--no-docker] [--no-android] [--scheme light|dark]');
  process.exit(2);
}

const scenario = (await import(pathToFileURL(join(toolDir, 'scenarios', `${scenarioName}.mjs`)).href)).default;
const useCaseDir = join(repoRoot, 'images', 'guides', scenario.useCase);
const composeFile = join(toolDir, scenario.compose);
// Per-run secrets never touch the repository; the instance is discarded afterwards.
// Against an existing instance (--no-docker) the secrets must come from the environment.
const missing = (scenario.secrets ?? []).filter((key) => !useDocker && !process.env[key]);
if (missing.length) {
  console.error(`--no-docker needs ${missing.join(', ')} in the environment (the values the running instance uses)`);
  process.exit(2);
}
const runEnv = { ...process.env, ...Object.fromEntries((scenario.secrets ?? []).map((key) => [key, process.env[key] || randomBytes(18).toString('base64url')])) };

const compose = (...composeArgs) => execFileSync('docker', ['compose', '-f', composeFile, ...composeArgs], { env: runEnv, stdio: 'inherit' });

const DEFAULTS = { maxWidth: 1600, phoneWidth: 540, quality: 0.86, pad: 16 };
// Annotation boxes sit this many CSS pixels outside the target so the ring does not cover labels.
const RING = 5;
const NAME = /^[a-z]+-\d{2}-[a-z0-9-]+$/;
const pct = (value, total) => Math.round((value / total) * 1000) / 10;

async function encodeWebp(browser, png, maxWidth, quality) {
  // Chromium's canvas encoder writes WebP, so the tool needs no image library.
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ({ dataUrl, maxWidth, quality }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const scale = Math.min(1, maxWidth / image.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const webp = canvas.toDataURL('image/webp', quality);
      if (!webp.startsWith('data:image/webp')) throw new Error('this Chromium build cannot encode WebP');
      return { base64: webp.split(',')[1], width: canvas.width, height: canvas.height };
    }, { dataUrl: `data:image/png;base64,${png.toString('base64')}`, maxWidth, quality });
  } finally {
    await page.close();
  }
}

// Unpacks a pinned extension release (zip) into a throwaway directory.
async function unpackExtension(pin, workDir) {
  const zip = await releaseAsset(pin);
  const dir = join(workDir, `ext-${pin.asset.replace(/\W+/g, '-')}`);
  mkdirSync(dir, { recursive: true });
  // bsdtar (Windows, macOS) reads zip files; Linux uses unzip.
  if (process.platform === 'linux') execFileSync('unzip', ['-q', zip, '-d', dir]);
  else execFileSync('tar', ['-xf', zip, '-C', dir]);
  return dir;
}

async function capture(workDir) {
  const viewport = scenario.viewport ?? { width: 1280, height: 800 };
  const deviceScaleFactor = scenario.deviceScaleFactor ?? 2;
  const hostRules = Object.entries(scenario.hosts ?? {}).map(([host, port]) => `MAP ${host}:443 127.0.0.1:${port}`).join(',');
  const extensionDirs = [];
  for (const pin of scenario.extensions ?? []) extensionDirs.push(await unpackExtension(pin, workDir));
  const launchArgs = [`--host-resolver-rules=${hostRules}`, '--ignore-certificate-errors'];
  if (extensionDirs.length) launchArgs.push(`--disable-extensions-except=${extensionDirs.join(',')}`, `--load-extension=${extensionDirs.join(',')}`);
  // The reference proxy uses a throwaway internal CA; real readers trust their own.
  const contextOptions = { viewport, deviceScaleFactor, colorScheme: scheme, locale: 'en-US', timezoneId: 'UTC', ignoreHTTPSErrors: true };
  // Extensions need a persistent context in the full Chromium build (new headless mode).
  const context = await chromium.launchPersistentContext(join(workDir, 'profile'), { ...contextOptions, channel: 'chromium', headless: true, args: launchArgs });
  const encoder = context; // pages for WebP encoding come from the same browser
  const page = context.pages()[0] ?? await context.newPage();
  const images = {};
  const files = [];
  const record = async (app, name, png, maxWidth, meta) => {
    if (!NAME.test(name)) throw new Error(`screenshot name '${name}' must match <platform>-<NN>-<slug>`);
    const webp = await encodeWebp(encoder, png, maxWidth, DEFAULTS.quality);
    const file = `${app}/${name}${scheme === 'dark' ? '-dark' : ''}.webp`;
    const buffer = Buffer.from(webp.base64, 'base64');
    files.push({ file, buffer });
    images[`${app}/${name}`] = { file, width: webp.width, height: webp.height, bytes: buffer.length, ...meta };
    console.log(`  ${file}  ${webp.width}x${webp.height}  ${Math.round(buffer.length / 1024)} KB`);
  };
  const boxOf = async (target, onPage) => (typeof target === 'string' ? onPage.locator(target) : target).first().boundingBox();
  const checkMarks = (name, marks) => {
    for (const mark of marks) {
      if (mark.top < -2 || mark.left < -2 || mark.top + mark.height > 102 || mark.left + mark.width > 102) throw new Error(`annotation ${mark.n} for '${name}' falls outside the captured region`);
    }
    return marks;
  };

  // Captures the viewport of `on` (default: the main page), or the box around
  // `clip` targets, and records `annotate` targets as percentage boxes.
  async function shot(name, { on = page, app = scenario.app, clip, annotate = [], pad = DEFAULTS.pad, maxWidth = DEFAULTS.maxWidth, alt } = {}) {
    await on.evaluate(() => document.fonts.ready);
    await on.waitForTimeout(400);
    const size = on.viewportSize() ?? viewport;
    let region = { x: 0, y: 0, width: size.width, height: size.height };
    if (clip) {
      const boxes = await Promise.all([].concat(clip).map((target) => boxOf(target, on)));
      if (boxes.some((box) => !box)) throw new Error(`clip target for '${name}' is not visible`);
      // pad: one number, or { top, right, bottom, left } in CSS pixels. Negative values crop inwards.
      const p = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : { top: 0, right: 0, bottom: 0, left: 0, ...pad };
      const left = Math.min(...boxes.map((box) => box.x)) - p.left;
      const top = Math.min(...boxes.map((box) => box.y)) - p.top;
      const right = Math.max(...boxes.map((box) => box.x + box.width)) + p.right;
      const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + p.bottom;
      if (left < -0.5 || top < -0.5 || right > size.width + 0.5 || bottom > size.height + 0.5) {
        throw new Error(`clip for '${name}' leaves the viewport; scroll the target into view, reduce pad, or enlarge the viewport`);
      }
      region = { x: Math.max(0, left), y: Math.max(0, top), width: Math.min(size.width, right) - Math.max(0, left), height: Math.min(size.height, bottom) - Math.max(0, top) };
    }
    const annotations = [];
    for (const [index, entry] of annotate.entries()) {
      // Entries are selectors/locators numbered in order, or { n, target } to
      // match the click-list number (n: null draws an unnumbered highlight).
      const { n = index + 1, target } = typeof entry === 'object' && 'target' in entry ? entry : { target: entry };
      const box = await boxOf(target, on);
      if (!box) throw new Error(`annotation ${index + 1} for '${name}' is not visible`);
      annotations.push({ n, top: pct(box.y - RING - region.y, region.height), left: pct(box.x - RING - region.x, region.width), width: pct(box.width + 2 * RING, region.width), height: pct(box.height + 2 * RING, region.height) });
    }
    const png = await on.screenshot({ clip: region, animations: 'disabled', caret: 'hide' });
    await record(app, name, png, maxWidth, { alt, annotations: checkMarks(name, annotations) });
  }

  let device;
  const android = {};
  if (scenario.android && useAndroid) {
    const problem = androidAvailable(scenario.android.avd);
    if (problem) throw new Error(`${problem}. Run with --no-android to skip the phone captures.`);
    const apks = [];
    for (const pin of scenario.android.apks ?? []) apks.push(await releaseAsset(pin));
    console.log(`booting emulator ${scenario.android.avd}`);
    device = await bootEmulator({ avd: scenario.android.avd, port: scenario.android.port });
    for (const apk of apks) device.install(apk);
    android.device = device;
    // Full-screen capture without the status and navigation bars; annotate takes
    // uiautomator queries ({ text, desc, id, hint }) or { n, target: query }.
    android.shot = async (name, { app = scenario.app, annotate = [], alt, top = 'status', bottom = 'nav' } = {}) => {
      await new Promise((r) => setTimeout(r, 1200));
      const screen = device.size();
      const nodes = device.nodes();
      const bar = (id) => nodes.find((node) => node['resource-id'] === id);
      const y1 = top === 'status' ? (bar('com.android.systemui:id/status_bar')?.y2 ?? 0) : top;
      const y2 = bottom === 'nav' ? (bar('com.android.systemui:id/navigation_bar_frame')?.y1 ?? screen.height) : bottom;
      const region = { x: 0, y: y1, width: screen.width, height: y2 - y1 };
      const marks = [];
      for (const [index, entry] of annotate.entries()) {
        const { n = index + 1, target } = entry && entry.target ? entry : { target: entry };
        const node = await device.waitFor(target, 5000);
        const ring = RING * 2.6; // device pixels at ~420 dpi
        marks.push({ n, top: pct(node.y1 - ring - region.y, region.height), left: pct(node.x1 - ring, region.width), width: pct(node.x2 - node.x1 + 2 * ring, region.width), height: pct(node.y2 - node.y1 + 2 * ring, region.height) });
      }
      const full = device.screenshotPng();
      const cropper = await encoder.newPage();
      const png = await cropper.evaluate(async ({ dataUrl, region }) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = region.width;
        canvas.height = region.height;
        canvas.getContext('2d').drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { dataUrl: `data:image/png;base64,${full.toString('base64')}`, region }).finally(() => cropper.close());
      await record(app, name, Buffer.from(png, 'base64'), DEFAULTS.phoneWidth, { alt, frame: 'phone', annotations: checkMarks(name, marks) });
    };
  }

  try {
    const details = await scenario.run({ page, context, shot, android: device ? android : null, env: runEnv });
    // Write only after the whole scenario succeeded, so images and manifest never disagree.
    for (const { file, buffer } of files) {
      mkdirSync(dirname(join(useCaseDir, file)), { recursive: true });
      writeFileSync(join(useCaseDir, file), buffer);
    }
    const manifest = { scenario: scenarioName, capturedAt: new Date().toISOString().slice(0, 10), scheme, viewport, deviceScaleFactor, ...details, images };
    const manifestFile = join(useCaseDir, `captures-${scenarioName}${scheme === 'dark' ? '-dark' : ''}.json`);
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`wrote ${files.length} images and ${relative(repoRoot, manifestFile)}`);
  } finally {
    try { await context.close(); } catch (error) { console.error(`browser close failed: ${error.message}`); }
    if (device && !keep) device.stop();
  }
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'guide-shots-'));
  try {
    if (useDocker) {
      console.log(`starting ${relative(repoRoot, composeFile)}`);
      compose('up', '-d', '--wait');
    }
    await capture(workDir);
  } finally {
    if (useDocker && !keep) compose('down', '--volumes');
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
