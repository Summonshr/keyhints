import { ORIGIN, expect, test } from './harness';

test.describe('timing', () => {
  // Timed inside the page (key sent -> overlay drawn). Key delivery and drawing an overlay cost
  // ~60 ms in this harness whatever KeyHints does, so the measure is what hints add on top of the
  // "?" sheet (drawn without looking at the page): finding and labelling every target.
  test('on a 20k-element page, hints take under 60 ms more than an empty overlay (medians of 7)', async ({ kh }) => {
    await kh.load('/big');
    const median = async (key: string) => {
      const times = [];
      for (let i = 0; i < 7; i++) {
        await kh.evalPage(() => {
          (window as any).__ms = undefined;
          (window as any).__t0 = performance.now();
          new MutationObserver((_, obs) => {
            if (document.querySelector('keyhints-overlay')) { (window as any).__ms = performance.now() - (window as any).__t0; obs.disconnect(); }
          }).observe(document.documentElement, { childList: true });
        });
        await kh.press(key);
        await kh.page.waitForFunction(() => (window as any).__ms !== undefined);
        times.push(Math.round(await kh.evalPage(() => (window as any).__ms as number)));
        await kh.press('Escape');
        await kh.page.waitForTimeout(100);
      }
      return times.sort((a, b) => a - b)[3];
    };
    const sheet = await median('?');
    const hints = await median('f');
    console.log(`      20k-element page: hints ${hints} ms, empty overlay ${sheet} ms: hints add ${hints - sheet} ms`);
    expect(hints - sheet).toBeLessThan(60);
  });

  test('hints work while the page is still loading', async ({ kh }) => {
    await kh.page.goto(`${ORIGIN}/slowpage`, { waitUntil: 'commit' });
    await kh.page.waitForSelector('#early');
    await kh.page.mouse.click(990, 790);
    expect(await kh.evalPage(() => document.readyState !== 'complete')).toBe(true);
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#early')).toBeTruthy();
    await kh.press('Escape');
    await kh.page.waitForLoadState('load');
  });

  test('KeyHints does not block the back/forward cache, and works right after Back', async ({ kh }) => {
    await kh.load('/bf');
    await kh.page.goto(`${ORIGIN}/pager2`);
    await kh.page.goBack({ waitUntil: 'commit' }); // a page restored from the cache fires no load event
    await kh.page.waitForTimeout(300);
    expect(await kh.evalPage(() => (window as any).restored)).toBe(true);
    await kh.page.mouse.click(990, 790);
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#bflink')).toBeTruthy();
  });
});
