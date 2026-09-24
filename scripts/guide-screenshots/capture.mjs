#!/usr/bin/env node
// Captures client setup guide screenshots from a local reference install.
//
//   node capture.mjs <scenario> [--keep] [--no-docker] [--scheme light|dark]
//
// A scenario (scenarios/<name>.mjs) names its Docker Compose file, the example
// hostnames it serves, and a `run` function that drives the app with synthetic
// data and calls `shot()` for each named step. Images land in
// images/guides/<use-case>/<app>/<name>.webp with a captures.json manifest.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, '..', '..');

const args = process.argv.slice(2);
const scenarioName = args.find((arg) => !arg.startsWith('--'));
const keep = args.includes('--keep');
const useDocker = !args.includes('--no-docker');
const schemeIndex = args.indexOf('--scheme');
const scheme = schemeIndex >= 0 ? args[schemeIndex + 1] : 'light';
if (!scenarioName || !['light', 'dark'].includes(scheme)) {
  console.error('usage: node capture.mjs <scenario> [--keep] [--no-docker] [--scheme light|dark]');
  process.exit(2);
}

const scenario = (await import(pathToFileURL(join(toolDir, 'scenarios', `${scenarioName}.mjs`)).href)).default;
const outDir = join(repoRoot, 'images', 'guides', scenario.useCase, scenario.app);
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

const DEFAULTS = { maxWidth: 1600, quality: 0.86, pad: 16 };
// Annotation boxes sit this many CSS pixels outside the target so the ring does not cover labels.
const RING = 5;

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

async function capture(browser) {
  const viewport = scenario.viewport ?? { width: 1280, height: 800 };
  const deviceScaleFactor = scenario.deviceScaleFactor ?? 2;
  // The reference proxy uses a throwaway internal CA; real readers trust their own.
  const context = await browser.newContext({ viewport, deviceScaleFactor, colorScheme: scheme, locale: 'en-US', timezoneId: 'UTC', ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const images = {};
  const files = [];

  // Captures the viewport, or the box around `clip` targets, and records
  // `annotate` targets as percentage boxes the guide component overlays.
  async function shot(name, { clip, annotate = [], pad = DEFAULTS.pad, maxWidth = DEFAULTS.maxWidth, alt } = {}) {
    if (!/^[a-z]+-\d{2}-[a-z0-9-]+$/.test(name)) throw new Error(`screenshot name '${name}' must match <platform>-<NN>-<slug>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    let region = { x: 0, y: 0, width: viewport.width, height: viewport.height };
    if (clip) {
      const boxes = await Promise.all([].concat(clip).map((target) => (typeof target === 'string' ? page.locator(target) : target).first().boundingBox()));
      if (boxes.some((box) => !box)) throw new Error(`clip target for '${name}' is not visible`);
      // pad: one number, or { top, right, bottom, left } in CSS pixels. Negative values crop inwards.
      const p = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : { top: 0, right: 0, bottom: 0, left: 0, ...pad };
      const left = Math.min(...boxes.map((box) => box.x)) - p.left;
      const top = Math.min(...boxes.map((box) => box.y)) - p.top;
      const right = Math.max(...boxes.map((box) => box.x + box.width)) + p.right;
      const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + p.bottom;
      if (left < -0.5 || top < -0.5 || right > viewport.width + 0.5 || bottom > viewport.height + 0.5) {
        throw new Error(`clip for '${name}' leaves the viewport; scroll the target into view, reduce pad, or enlarge the scenario viewport`);
      }
      region = { x: Math.max(0, left), y: Math.max(0, top), width: Math.min(viewport.width, right) - Math.max(0, left), height: Math.min(viewport.height, bottom) - Math.max(0, top) };
    }
    const annotations = [];
    for (const [index, entry] of annotate.entries()) {
      // Entries are selectors/locators numbered in order, or { n, target } to
      // match the click-list number (n: null draws an unnumbered highlight).
      const { n = index + 1, target } = typeof entry === 'object' && 'target' in entry ? entry : { target: entry };
      const box = await (typeof target === 'string' ? page.locator(target) : target).first().boundingBox();
      if (!box) throw new Error(`annotation ${index + 1} for '${name}' is not visible`);
      const pct = (value, total) => Math.round((value / total) * 1000) / 10;
      const mark = {
        n,
        top: pct(box.y - RING - region.y, region.height),
        left: pct(box.x - RING - region.x, region.width),
        width: pct(box.width + 2 * RING, region.width),
        height: pct(box.height + 2 * RING, region.height),
      };
      if (mark.top < -2 || mark.left < -2 || mark.top + mark.height > 102 || mark.left + mark.width > 102) {
        throw new Error(`annotation ${index + 1} for '${name}' falls outside the captured region`);
      }
      annotations.push(mark);
    }
    const png = await page.screenshot({ clip: region, animations: 'disabled', caret: 'hide' });
    const webp = await encodeWebp(browser, png, maxWidth, DEFAULTS.quality);
    const file = `${name}${scheme === 'dark' ? '-dark' : ''}.webp`;
    const buffer = Buffer.from(webp.base64, 'base64');
    files.push({ file, buffer });
    images[name] = { file, width: webp.width, height: webp.height, bytes: buffer.length, alt, annotations };
    console.log(`  ${file}  ${webp.width}x${webp.height}  ${Math.round(buffer.length / 1024)} KB`);
  }

  const details = await scenario.run({ page, context, shot, env: runEnv });
  // Write only after the whole scenario succeeded, so images and manifest never disagree.
  mkdirSync(outDir, { recursive: true });
  for (const { file, buffer } of files) writeFileSync(join(outDir, file), buffer);
  const manifest = { scenario: scenarioName, capturedAt: new Date().toISOString().slice(0, 10), scheme, viewport, deviceScaleFactor, ...details, images };
  const manifestFile = join(outDir, scheme === 'dark' ? 'captures-dark.json' : 'captures.json');
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${files.length} images and ${relative(repoRoot, manifestFile)}`);
}

async function main() {
  let browser;
  try {
    if (useDocker) {
      console.log(`starting ${relative(repoRoot, composeFile)}`);
      compose('up', '-d', '--wait');
    }
    const hostRules = Object.entries(scenario.hosts).map(([host, port]) => `MAP ${host}:443 127.0.0.1:${port}`).join(',');
    browser = await chromium.launch({ args: [`--host-resolver-rules=${hostRules}`] });
    await capture(browser);
  } finally {
    try { await browser?.close(); } catch (error) { console.error(`browser close failed: ${error.message}`); }
    if (useDocker && !keep) compose('down', '--volumes');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
