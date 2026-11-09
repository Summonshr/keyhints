import { readFileSync } from 'node:fs';
import { ORIGIN, expect, test } from './harness';

test.describe('post mode (Alt+I)', () => {
  test('highlight, like, move, reply, hover-only mute, copy link, hints in the post, open', async ({ kh }) => {
    const acts = () => kh.evalPage(() => ((window as any).acts || []) as string[]);
    await kh.load('/feed');
    await kh.sendToTab('item-mode');
    await kh.settle();
    expect((await kh.overlayNodes()).some((n) => n.kind === 'ring')).toBe(true);
    expect(await kh.barText()).toMatch(/^POST/);
    await kh.press('l');
    await kh.settle();
    expect(await acts()).toHaveLength(1);
    const first = Number((await acts())[0].replace('like', ''));
    await kh.press('j');
    await kh.page.waitForTimeout(250);
    await kh.press('l');
    await kh.settle();
    expect((await acts()).at(-1)).toBe(`like${first + 1}`);
    await kh.press('k', 'k');
    await kh.page.waitForTimeout(250);
    await kh.press('r');
    await kh.settle();
    expect((await acts()).at(-1)).toBe(`reply${first - 1}`);
    await kh.press('m');
    await kh.page.waitForTimeout(400);
    expect((await acts()).at(-1), 'm finds a hover-only mute button').toBe(`mute${first - 1}`);
    await kh.press('c');
    await kh.settle();
    expect(await kh.clipboard()).toBe(`${ORIGIN}/post/${first - 1}`);
    await kh.press('f');
    await kh.settle();
    expect(await kh.visibleHints(), 'link, like, reply, and the now visible mute').toHaveLength(4);
    await kh.press('Escape');
    await kh.sendToTab('item-mode');
    await kh.settle();
    await Promise.all([kh.page.waitForURL(/\/post\/\d$/), kh.press('o')]);
  });

  test('counts on the ring, copy the text, save the post as a PNG without the ring in it', async ({ kh }) => {
    await kh.load('/xfeed');
    await kh.sendToTab('item-mode');
    await kh.settle();
    expect(await kh.nodeText('chip')).toMatch(/^95\d views · 1\d likes · 2 bookmarks · 3 reposts · 1 reply$/);
    await kh.press('y');
    await kh.settle();
    expect(await kh.clipboard()).toMatch(/^Hello post \d$/);
    const [download] = await Promise.all([kh.page.waitForEvent('download'), kh.press('s')]);
    const png = readFileSync((await download.path())!);
    const post = await kh.evalPage(() => { const r = document.querySelector('article')!.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(download.suggestedFilename()).toMatch(/localhost-post-.*\.png$/);
    expect(Math.abs(png.readUInt32BE(16) - post.w)).toBeLessThanOrEqual(2);
    expect(Math.abs(png.readUInt32BE(20) - post.h)).toBeLessThanOrEqual(2);
    expect((await kh.overlayNodes()).some((n) => n.kind === 'ring'), 'the overlay is back afterwards').toBe(true);
  });
});
