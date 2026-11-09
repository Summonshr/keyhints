// Smoke test on real public sites (needs internet). Screenshots: /tmp/keyhints-real-*.png
import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = {
  wikipedia: 'https://en.wikipedia.org/wiki/Computer_keyboard',
  github: 'https://github.com/torvalds/linux',
  hackernews: 'https://news.ycombinator.com/',
  youtube: 'https://www.youtube.com/',
  mdn: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
};

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'keyhints-')), {
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  viewport: { width: 1280, height: 800 },
});
const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
// The welcome tab opens on install and would be the active tab hints are sent to.
await new Promise((r) => setTimeout(r, 1500));
for (const p of context.pages()) if (p.url().includes('welcome.html')) await p.close();
const page = context.pages()[0] || await context.newPage();
// Alt+J (bare f is left to sites with their own keys, like YouTube).
const altJ = () => sw.evaluate(async () => toggleHints((await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]));
const cdp = await context.newCDPSession(page);

async function hintLabels() {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const labels = [];
  const text = (n) => (n.nodeType === 3 ? n.nodeValue : (n.children || []).map(text).join(''));
  (function walk(n) {
    const attrs = n.attributes || [];
    const cls = attrs[attrs.indexOf('class') + 1] || '';
    if (attrs.includes('class') && cls.split(' ').includes('hint')) labels.push(text(n));
    if (n.contentDocument) walk(n.contentDocument);
    for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) walk(c);
  })(root);
  return labels;
}

let failures = 0;
for (const [name, url] of Object.entries(SITES)) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2500);
    await page.mouse.click(1270, 400);
    const elements = await page.evaluate(() => document.getElementsByTagName('*').length);
    await page.evaluate(() => {
      window.__t0 = performance.now();
      new MutationObserver((_, obs) => {
        if (document.querySelector('keyhints-overlay')) { window.__ms = performance.now() - window.__t0; obs.disconnect(); }
      }).observe(document.documentElement, { childList: true });
    });
    await altJ();
    await page.waitForFunction(() => window.__ms !== undefined, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    const ms = Math.round(await page.evaluate(() => window.__ms));
    const labels = await hintLabels();
    const prefixFree = labels.every((a) => labels.every((b) => a === b || !b.startsWith(a)));
    const maxLen = Math.max(...labels.map((l) => l.length));
    await page.screenshot({ path: `/tmp/keyhints-real-${name}.png` });
    const ok = labels.length > 0 && prefixFree && new Set(labels).size === labels.length && maxLen <= 2;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${labels.length} hints, longest ${maxLen} keys, prefix-free ${prefixFree}, ${ms} ms, ${elements} elements`);
    await page.keyboard.press('Escape');
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}: ${err.message.split('\n')[0]}`);
  }
}
await context.close();
process.exit(failures ? 1 : 0);
