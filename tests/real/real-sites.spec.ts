// Real public sites: hints appear quickly, at most two keys, prefix-free. Screenshots: /tmp/keyhints-real-*.png
import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserOptions, PREFIX_FREE } from '../e2e/harness';

const SITES = {
  wikipedia: 'https://en.wikipedia.org/wiki/Computer_keyboard',
  github: 'https://github.com/torvalds/linux',
  hackernews: 'https://news.ycombinator.com/',
  youtube: 'https://www.youtube.com/',
  mdn: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
};

let context: BrowserContext;
let sw: Worker;
test.beforeAll(async () => {
  const ext = join(import.meta.dirname, '..', '..', '.output', 'chrome-mv3');
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'keyhints-real-')), {
    ...browserOptions(), headless: true, viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await new Promise((r) => setTimeout(r, 1500)); // the welcome tab would be the active tab: close it
  for (const p of context.pages()) if (p.url().endsWith('/welcome.html')) await p.close();
});
test.afterAll(() => context.close());

for (const [name, url] of Object.entries(SITES)) {
  test(name, async () => {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.mouse.click(1270, 400);
    await page.evaluate(() => {
      (window as any).__t0 = performance.now();
      new MutationObserver((_, obs) => {
        if (document.querySelector('keyhints-overlay')) { (window as any).__ms = performance.now() - (window as any).__t0; obs.disconnect(); }
      }).observe(document.documentElement, { childList: true });
    });
    // Alt+J (bare f is left to sites with their own keys, like YouTube).
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.tabs.sendMessage(tab.id!, { type: 'toggle-hints' }, { frameId: 0 });
    });
    await page.waitForFunction(() => (window as any).__ms !== undefined, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    const cdp = await context.newCDPSession(page);
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const labels: string[] = [];
    type N = { nodeType: number; nodeValue: string; attributes?: string[]; children?: N[]; shadowRoots?: N[]; contentDocument?: N };
    const text = (n: N): string => (n.nodeType === 3 ? n.nodeValue : (n.children || []).map(text).join(''));
    (function walk(n: N) {
      const a = n.attributes || [];
      const cls = a[a.indexOf('class') + 1] || '';
      if (a.includes('class') && cls.split(' ').includes('hint')) labels.push(text(n));
      if (n.contentDocument) walk(n.contentDocument);
      for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) walk(c);
    })(root as unknown as N);
    await page.screenshot({ path: `/tmp/keyhints-real-${name}.png` });
    const ms = Math.round(await page.evaluate(() => (window as any).__ms));
    console.log(`      ${name}: ${labels.length} hints, longest ${Math.max(...labels.map((l) => l.length))} keys, ${ms} ms`);
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(labels.length);
    expect(PREFIX_FREE(labels)).toBe(true);
    expect(labels.every((l) => l.length <= 2)).toBe(true);
    await page.keyboard.press('Escape');
  });
}
