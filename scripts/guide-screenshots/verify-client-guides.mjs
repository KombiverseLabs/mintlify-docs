#!/usr/bin/env node
// Browser journeys against a real, already-running Mintlify preview. No fixtures
// or test users are needed: these guides store only reader progress locally.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--base-url') || !args.includes('--output-dir')) {
  console.error('Usage: node verify-client-guides.mjs --base-url http://localhost:3000 --output-dir /absolute/ignored/evidence');
  process.exit(2);
}
const base = new URL(option('--base-url'));
const output = resolve(option('--output-dir'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const results = [];
const geometryResults = [];
const geometry = function geometry() {
  const panel = document.querySelector('.guide-panel.active');
  const heading = panel.querySelector('h3');
  const instruction = panel.querySelector('.click-list li');
  const navbar = document.querySelector('#navbar');
  const navRect = navbar.getBoundingClientRect();
  const inspect = (element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + Math.min(10, rect.height / 2));
    return { rect: rect.toJSON(), rendered: element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }),
      belowHeader: rect.top >= navRect.bottom, insideViewport: rect.top >= 0 && rect.bottom <= innerHeight,
      hitInside: !!hit && element.contains(hit), hitTag: hit?.tagName, hitClass: hit?.className };
  };
  const h = inspect(heading), first = inspect(instruction);
  return { url: location.href, assertion: 'Search-result target heading and first instruction are unobscured by fixed header',
    context: 'local native anchor flow; not actual hosted Mint search', activePanel: panel.id,
    viewport: { width: innerWidth, height: innerHeight }, navbar: navRect.toJSON(),
    mintScrollMargin: getComputedStyle(document.documentElement).getPropertyValue('--scroll-mt'),
    headingScrollMargin: getComputedStyle(heading).scrollMarginTop, heading: h, firstInstruction: first,
    pass: [h, first].every(x => x.rendered && x.belowHeader && x.insideViewport && x.hitInside) };
};
const assertUnobscured = async (path, arrival) => {
  await page.waitForTimeout(300);
  const observed = await page.evaluate(geometry);
  geometryResults.push({ path, arrival, ...observed });
  assert.equal(observed.pass, true, `${path}: ${arrival}: target heading or first instruction obscured by fixed header`);
};
try {
  for (const locale of ['', 'de/', 'es/', 'zh-Hans/', 'hi/', 'ar/']) {
    for (const [guide, targetIndex, expectedCount] of [['passwords/clients', 3, 6], ['photos/phone-backup', 2, 4]]) {
      const path = `${locale}guides/stackkits/use-cases/${guide}`;
      const url = new URL(path, base.href.endsWith('/') ? base : new URL(base.href + '/'));
      await page.goto(url.href);
      const root = page.locator('.kombify-client-guide');
      await root.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('.guide-enhanced'));
      const headings = await root.locator('.guide-panel h3').evaluateAll((nodes) => nodes.map((node) => node.id));
      assert.equal(headings.length, expectedCount, path);
      url.hash = headings[targetIndex];
      // A fresh document proves an initial deep link, as used by Mint search.
      await page.goto(url.href);
      await page.reload();
      await page.waitForFunction((expected) => {
        const panels = [...document.querySelectorAll('.guide-panel')];
        return panels[expected]?.classList.contains('active') && panels[expected].querySelector('h3')?.getClientRects().length;
      }, targetIndex);
      const target = root.locator('.guide-panel').nth(targetIndex);
      assert.equal(await target.locator('h3').isVisible(), true, `${path}: hash target hidden`);
      const initial = await target.getAttribute('id');
      // Native anchor arrivals exercise the real scroll layout. Local Mint
      // search requires login, so these are not hosted search-result assertions.
      for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        if (viewport.width === 390) {
          await page.reload();
          await page.waitForFunction((expected) => document.querySelectorAll('.guide-panel')[expected]?.classList.contains('active'), targetIndex);
        }
        await assertUnobscured(path, `${viewport.width}px initial hash`);
        const heading = target.locator('h3');
        await heading.hover();
        await heading.locator('a[href]').click();
        await assertUnobscured(path, `${viewport.width}px same-page anchor`);
        await root.locator('.step-tab').nth(0).click();
        await root.locator('.step-tab').nth(targetIndex).click();
        await heading.hover();
        await heading.locator('a[href]').click();
        await assertUnobscured(path, `${viewport.width}px repeated same-hash anchor`);
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      const provenance = root.locator('.provenance-inline a');
      let sources = null;
      if (await provenance.count()) {
        await provenance.click();
        const href = await provenance.getAttribute('href');
        const section = root.locator(`[id="${decodeURIComponent(href.slice(1))}"]`);
        const disclosure = section.locator('[data-guide-disclosure]');
        const body = disclosure.locator('.source-content');
        sources = { href, expanded: await disclosure.locator('.disclosure-title').getAttribute('aria-expanded'), bodyVisible: await body.isVisible(), bodyTextLength: (await body.textContent()).trim().length };
        assert.equal(sources.expanded, 'true', `${path}: provenance link leaves source disclosure collapsed`);
        assert.equal(sources.bodyVisible, true, `${path}: provenance link leaves source body hidden`);
        assert.ok(sources.bodyTextLength > 0, `${path}: provenance link opens empty sources`);
        assert.equal(await root.locator('.guide-panel.active').getAttribute('id'), initial, `${path}: provenance link changes selected step`);
      }
      // Print the real browser layout. Class-based screen visibility must not
      // suppress any native heading or instructions in the print document.
      await page.emulateMedia({ media: 'print' });
      assert.equal(await page.locator('#navbar').isVisible(), false, `${path}: navigation covers printed text`);
      const print = await root.locator('.guide-panel').evaluateAll((nodes) => nodes.map((node) => ({
        id: node.id, display: getComputedStyle(node).display,
        visible: !!node.querySelector('h3')?.getClientRects().length,
        prose: node.querySelector('.step-content')?.innerText.trim().length || 0,
      })));
      assert.equal(print.every((panel) => panel.visible && panel.display !== 'none' && panel.prose > 0), true, `${path}: print loses a step`);
      if (!locale) {
        await page.pdf({ path: resolve(output, guide.replace('/', '-') + '.pdf'), format: 'A4', printBackground: true });
      }
      results.push({ path, hash: url.hash, expectedPanel: targetIndex, activePanel: initial, sources, print, pass: true });
      await page.emulateMedia({ media: 'screen' });
    }
  }
} finally {
  await writeFile(resolve(output, 'reader-regression.json'), JSON.stringify({ baseUrl: base.href, hostedMarkdownOrSearchAcceptance: false, geometryResults, results }, null, 2) + '\n');
  await context.close();
  await browser.close();
}
console.log(`Client guide browser regression passed: ${results.length} pages. Hosted Markdown and Mint search still require public acceptance.`);
