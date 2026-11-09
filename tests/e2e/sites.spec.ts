import { ORIGIN, expect, test, type KH } from './harness';

async function open(kh: KH, url: string) {
  await kh.page.goto(url);
  await kh.page.waitForTimeout(200);
  await kh.page.mouse.click(990, 790);
}

test.describe('toolbar button: single keys on / off per site', () => {
  test('badge, f off, Alt+J still on, survives reload, toggles back', async ({ kh }) => {
    await kh.load();
    await kh.toggleSite();
    await kh.page.waitForTimeout(200);
    expect(await kh.badge()).toBe('off');
    await kh.press('f');
    await kh.settle();
    expect(await kh.hints()).toHaveLength(0);
    await kh.altJ();
    await kh.settle();
    expect((await kh.hints()).length).toBeGreaterThan(0);
    await kh.press('Escape');
    await kh.load();
    expect(await kh.badge()).toBe('off');
    await kh.toggleSite();
    await kh.page.waitForTimeout(200);
    await kh.press('f');
    await kh.settle();
    expect(await kh.badge()).toBe('');
    expect((await kh.hints()).length).toBeGreaterThan(0);
  });

  test('YouTube keeps its own bare keys; the button gives them to KeyHints and back', async ({ kh }) => {
    await open(kh, 'https://www.youtube.com/');
    await kh.press('f');
    await kh.settle();
    expect(await kh.hints()).toHaveLength(0);
    expect(await kh.badge()).toBe('off');
    await kh.altJ();
    await kh.settle();
    expect((await kh.hints()).length).toBeGreaterThan(0);
    await kh.press('Escape');
    await kh.toggleSite();
    await kh.page.waitForTimeout(200);
    await kh.press('f');
    await kh.settle();
    expect((await kh.hints()).length).toBeGreaterThan(0);
    expect(await kh.badge()).toBe('');
    await kh.press('Escape');
    await kh.toggleSite();
    await kh.page.waitForTimeout(200);
    expect(await kh.badge()).toBe('off');
    expect((await kh.settings()).enabledSites).not.toContain('www.youtube.com');
  });
});

test.describe('keys left to a site', () => {
  test('palette leaves f to the site, ? shows it, and the same key takes it back', async ({ kh }) => {
    await kh.load('/nav2');
    await kh.runPalette('leave a key to this site');
    expect(await kh.barText()).toMatch(/LEAVE A KEY/);
    await kh.press('f');
    await kh.settle();
    expect(await kh.toastText()).toMatch(/keeps f now/);
    await kh.evalPage(() => { (window as any).pageKeys = []; });
    await kh.press('f');
    await kh.settle();
    expect(await kh.hints()).toHaveLength(0);
    expect(await kh.evalPage(() => (window as any).pageKeys)).toContain('f');
    await kh.press('?');
    await kh.settle();
    expect(await kh.nodeText('help')).toMatch(/left to the site/);
    await kh.press('Escape');
    await kh.runPalette('leave a key to this site');
    await kh.press('f');
    await kh.settle();
    expect(await kh.toastText()).toMatch(/is KeyHints' again/);
    await kh.press('f');
    await kh.settle();
    expect((await kh.hints()).length).toBeGreaterThan(0);
  });
});

test.describe('search results and video lists get 1–9, 0', () => {
  const hintAt = async (kh: KH, selector: string) => {
    const r = await kh.page.locator(selector).first().evaluate((el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top) }; });
    return (await kh.hints()).find((h) => Math.abs(h.atX - r.x) <= 1 && Math.abs(h.atY - r.y) <= 1)?.label;
  };

  test('Google: results 1–9 then 0, the rest keep letters, a pick saves nothing', async ({ kh }) => {
    await open(kh, 'https://www.google.com/search?q=x');
    await kh.press('f');
    await kh.settle();
    const labels = await Promise.all(Array.from({ length: 11 }, (_, i) => hintAt(kh, `a[href="/r${i + 1}"]`)));
    expect(labels.slice(0, 10).join('')).toBe('1234567890');
    expect(labels[10]).toMatch(/^[a-z]+$/);
    expect(await hintAt(kh, 'a[href="/more1"]')).toMatch(/^[a-z]+$/);
    expect(await hintAt(kh, 'a[href="/settings"]')).toMatch(/^[a-z]+$/);
    await Promise.all([kh.page.waitForURL('**/r3'), kh.press('3')]);
    const memo = await kh.memory('www.google.com');
    expect(Object.keys(memo).some((k) => k.includes('/r3'))).toBe(false);
  });

  test('YouTube: video titles get digits; thumbnails, channels and Home keep letters', async ({ kh }) => {
    await open(kh, 'https://www.youtube.com/results?search_query=x');
    await kh.altJ();
    await kh.settle();
    expect(await hintAt(kh, '#video-title')).toBe('1');
    expect(await hintAt(kh, 'a#video-title[href$="=3"]')).toBe('3');
    expect(await hintAt(kh, '#thumbnail')).toMatch(/^[a-z]+$/);
    expect(await hintAt(kh, 'a[href="/@chan1"]')).toMatch(/^[a-z]+$/);
    await Promise.all([kh.page.waitForURL('**/watch?v=2'), kh.press('2')]);
    await open(kh, 'https://www.youtube.com/watch?v=list');
    await kh.altJ();
    await kh.settle();
    const watch = await Promise.all(['a[href="/watch?v=p1&list=L"]', 'a[href="/watch?v=p2&list=L"]', 'a.ytLockupMetadataViewModelTitle[href$="s1"]',
      'a.ytLockupMetadataViewModelTitle[href$="s2"]', 'a.ytLockupViewModelContentImage', 'a[href="/"]'].map((s) => hintAt(kh, s)));
    expect(watch.slice(0, 4).join('')).toBe('1234');
    expect(watch.slice(4).every((l) => /^[a-z]+$/.test(l || ''))).toBe(true);
  });
});

test.describe('video controls', () => {
  const video = (kh: KH, prop: 'currentTime' | 'playbackRate') => kh.evalPage((p) => (document.getElementById('v') as HTMLVideoElement)[p], prop);
  async function openWatch(kh: KH, host: string) {
    await kh.page.goto(`https://${host}/watch?v=1`);
    await kh.page.waitForFunction(() => { const v = document.getElementById('v') as HTMLVideoElement; return v.readyState >= 1 && v.duration > 0; });
    await kh.page.mouse.click(990, 790);
  }

  test('YouTube: seek, speed (kept across a new video), its own keys, never while typing', async ({ kh }) => {
    await openWatch(kh, 'www.youtube.com');
    await kh.press(']');
    await kh.settle();
    expect(Math.round(await video(kh, 'currentTime'))).toBe(30);
    expect(await kh.nodeText('osd')).toMatch(/\+30s · 0:30/);
    await kh.press('}');
    await kh.settle();
    expect(Math.round(await video(kh, 'currentTime'))).toBe(90);
    await kh.press('[', '{');
    await kh.settle();
    expect(Math.round(await video(kh, 'currentTime'))).toBe(0);
    await kh.press('>', '>');
    await kh.settle();
    expect(await video(kh, 'playbackRate')).toBe(1.5);
    expect(await kh.nodeText('osd')).toMatch(/1\.5×/);
    for (let i = 0; i < 10; i++) await kh.press('>');
    expect(await video(kh, 'playbackRate')).toBe(3);
    for (let i = 0; i < 12; i++) await kh.press('<');
    expect(await video(kh, 'playbackRate')).toBe(0.5);
    await kh.press('>', '>', '>'); // 1.25×
    await kh.evalPage(() => { (document.getElementById('v') as HTMLVideoElement).src = '/media/clip.webm?next'; }); // the browser resets speed
    await kh.page.waitForFunction(() => (document.getElementById('v') as HTMLVideoElement).readyState >= 1);
    await kh.settle();
    expect(await video(kh, 'playbackRate')).toBe(1.25);
    await kh.press('5', 'Shift+N');
    await kh.settle();
    expect(await kh.evalPage(() => (window as any).pageKeys)).toEqual(expect.arrayContaining(['5', 'N']));
    expect(Math.round(await video(kh, 'currentTime'))).toBe(0);
    await kh.page.locator('#search').focus();
    await kh.page.keyboard.type(']>s');
    await kh.page.locator('#comment').focus();
    await kh.press('End');
    await kh.page.keyboard.type('[');
    expect(await kh.page.locator('#search').inputValue()).toBe(']>s');
    expect(await kh.page.locator('#comment').textContent()).toBe('c[');
    expect(Math.round(await video(kh, 'currentTime'))).toBe(0);
    expect(await video(kh, 'playbackRate')).toBe(1.25);
  });

  test('YouTube: skip, time, the ? sheet, and the palette', async ({ kh }) => {
    await openWatch(kh, 'www.youtube.com');
    await kh.press('s');
    await kh.page.waitForTimeout(400);
    expect(await kh.nodeText('osd')).toMatch(/No skip button/);
    await kh.evalPage(() => { (document.querySelector('.ytp-ad-skip-button-modern') as HTMLElement).style.display = 'inline-block'; });
    await kh.press('s');
    await kh.settle();
    expect(await kh.evalPage(() => (window as any).skipped)).toBe(true);
    await kh.press('Shift+T');
    await kh.settle();
    expect(await kh.nodeText('osd')).toMatch(/\/ 5:00 · .* left/);
    await kh.altJ();
    await kh.settle();
    expect(await kh.barText(), "the hint bar leaves out video keys (they don't work while hints show)").not.toMatch(/±30s/);
    await kh.press('Escape');
    await kh.altJ();
    await kh.settle();
    await kh.press('Shift+Slash'); // bare ? is YouTube's own; from hint mode it opens ours
    await kh.settle();
    expect(await kh.nodeText('help')).toMatch(/±30s/);
    await kh.press('Escape');
    await kh.sendToTab('open-palette');
    await kh.settle();
    expect((await kh.results()).find((r) => r.on)?.text).toMatch(/skip intro/i);
    await kh.page.keyboard.type('forward 30', { delay: 60 });
    await kh.page.waitForTimeout(300);
    await kh.press('Enter');
    await kh.settle();
    expect(Math.round(await video(kh, 'currentTime'))).toBe(30);
  });

  test('Netflix: seeks only through its player API; 0–9, speed, skip, next episode; f stays Netflix\'s', async ({ kh }) => {
    await openWatch(kh, 'www.netflix.com');
    await kh.press(']');
    await kh.settle();
    expect(await kh.evalPage(() => (window as any).seeks)).toEqual([30000]);
    await kh.press('5');
    await kh.settle();
    expect(await kh.evalPage(() => (window as any).seeks.at(-1))).toBe(150000);
    expect(await kh.evalPage(() => (window as any).currentTimeWrites), 'video.currentTime is never written (error M7375)').toBe(0);
    await kh.press('>');
    expect(await video(kh, 'playbackRate')).toBe(1.25);
    await kh.evalPage(() => {
      (document.querySelector('[data-uia="player-skip-intro"]') as HTMLElement).style.display = 'inline-block';
      (document.querySelector('[data-uia="next-episode-seamless-button"]') as HTMLElement).style.display = 'inline-block';
    });
    await kh.press('s', 'Shift+N');
    await kh.settle();
    expect(await kh.evalPage(() => (window as any).skipped === true && (window as any).nexted === true)).toBe(true);
    await kh.press('f');
    await kh.settle();
    expect(await kh.hints()).toHaveLength(0);
    expect(await kh.evalPage(() => (window as any).pageKeys)).toContain('f');
  });
});

test.describe('GitHub and Jira', () => {
  test('GitHub pull request files: J N K v, and its own j still works', async ({ kh }) => {
    await open(kh, 'https://github.com/o/r/pull/1/changes');
    const fileTop = (i: number) => kh.evalPage((n) => Math.round(document.getElementById(`diff-${n}`)!.getBoundingClientRect().top), i);
    await kh.press('Shift+J');
    await kh.settle();
    expect(await fileTop(1)).toBe(120);
    await kh.press('Shift+N');
    await kh.settle();
    expect(await kh.evalPage(() => Math.round(document.querySelector('[data-testid=review-thread]')!.getBoundingClientRect().top))).toBe(120);
    await kh.press('Shift+K');
    await kh.settle();
    expect(await fileTop(1)).toBe(120);
    await kh.press('v');
    await kh.settle();
    expect(await kh.evalPage(() => document.querySelector('#diff-1 button')!.getAttribute('aria-pressed'))).toBe('true');
    expect(await kh.toastText()).toMatch(/Viewed: b\.php/);
    await kh.press('j');
    expect(await kh.evalPage(() => (window as any).pageKeys)).toContain('j');
  });

  test('Jira: Y copies the issue key, its own i still works', async ({ kh }) => {
    await open(kh, 'https://example.atlassian.net/browse/ABC-42');
    await kh.press('Shift+Y');
    await kh.settle();
    expect(await kh.clipboard()).toBe('ABC-42');
    await kh.press('i');
    expect(await kh.evalPage(() => (window as any).pageKeys)).toContain('i');
  });
});

test.describe(']] and [[ follow the page\'s own Next / Previous links', () => {
  test(']] finds "Next ›" below the fold, [[ follows rel=prev, ] then another key goes to the page', async ({ kh }) => {
    await kh.load('/pager');
    await Promise.all([kh.page.waitForURL(`${ORIGIN}/pager2`), kh.press(']', ']')]);
    await kh.page.mouse.click(990, 790);
    await Promise.all([kh.page.waitForURL(`${ORIGIN}/pager`), kh.press('[', '[')]);
    await kh.page.mouse.click(990, 790);
    await kh.press(']', 'x');
    await kh.settle();
    expect(kh.page.url()).toBe(`${ORIGIN}/pager`);
    expect(await kh.evalPage(() => (window as any).pageKeys)).toEqual([']', 'x']);
  });
});
