// What happens to open tabs when KeyHints is updated. (The update itself can't be run here:
// headless Chromium doesn't bring back an extension loaded from the command line after
// chrome.runtime.reload(), so each half is tested on its own.)
import { ORIGIN, expect, test } from './harness';

test('a second copy injected into an open tab (as on update) takes over: one set of hints', async ({ kh }) => {
  await kh.load('/nav');
  await kh.sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    await chrome.scripting.executeScript({ target: { tabId: tab.id!, allFrames: true }, files: ['content-scripts/content.js'] });
  }, `${ORIGIN}/nav`);
  await kh.page.waitForTimeout(300);
  await kh.page.mouse.click(990, 790);
  await kh.press('f');
  await kh.settle();
  expect(await kh.evalPage(() => document.querySelectorAll('keyhints-overlay').length)).toBe(1);
  expect((await kh.labels()).filter((l) => l === 'h')).toHaveLength(1);
  await kh.press('h');
  await kh.settle();
  expect(kh.page.url()).toBe(`${ORIGIN}/nav#home`);
});

// Runs last: the extension doesn't come back after this in headless Chromium.
test('after KeyHints is reloaded, the copy left in an open tab is quiet: no hints, no errors', async ({ kh }) => {
  await kh.load('/nav');
  await kh.sw.evaluate(() => chrome.runtime.reload()).catch(() => {}); // the worker dies mid-call
  await kh.page.waitForTimeout(1000);
  await kh.page.mouse.click(990, 790);
  await kh.evalPage(() => { (window as any).got = []; addEventListener('keydown', (e) => (window as any).got.push(e.key)); });
  await kh.press('f', 'Control+ArrowRight');
  await kh.settle();
  expect(await kh.evalPage(() => document.querySelectorAll('keyhints-overlay').length)).toBe(0);
  expect(await kh.evalPage(() => (window as any).got), 'keys reach the page untouched').toEqual(expect.arrayContaining(['f', 'ArrowRight']));
});
