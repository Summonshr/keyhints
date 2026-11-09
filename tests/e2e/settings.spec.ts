import type { Page } from '@playwright/test';
import { PREFIX_FREE, TOTAL, expect, test, type KH } from './harness';

const openOptions = (kh: KH): Promise<Page> => kh.openOptions();

test.describe('settings page', () => {
  test('shortcuts and the built-in sites are listed', async ({ kh }) => {
    const options = await openOptions(kh);
    const shortcuts = await options.textContent('#shortcuts');
    expect(shortcuts).toMatch(/Alt\+J/);
    expect(shortcuts).toMatch(/Alt\+K/);
    expect(await options.textContent('#sites')).toMatch(/youtube\.com.*off/);
  });

  test('hint letters: bad ones rejected, new ones keep the saved labels that fit', async ({ kh }) => {
    await kh.load();
    await kh.pick('#refresh');
    await kh.setLocal({ 'labels:localhost': { ...(await kh.memory()), FAKE: { label: 'qw', name: 'Nowhere', used: 1, uses: 1 } } });
    const options = await openOptions(kh);
    await options.fill('#alphabet', 'asda');
    await options.click('#save-alphabet');
    expect(await options.textContent('#status')).toMatch(/only once/);
    const fits = (l: string) => l.length === 1 || /^[asdfjkl]+$/.test(l);
    const before = await kh.savedLabels();
    await options.fill('#alphabet', 'asdfjkl');
    await options.press('#alphabet', 'Enter');
    await options.waitForTimeout(300);
    expect((await kh.settings()).alphabet).toBe('asdfjkl');
    const after = await kh.savedLabels();
    expect(before.some((l) => !fits(l))).toBe(true);
    expect(after).toEqual(before.filter(fits));
    await kh.page.bringToFront();
    await kh.load();
    await kh.press('f');
    await kh.settle();
    const labels = await kh.labels();
    const initials = await kh.evalPage(() => [...document.querySelectorAll('*')].map((e) =>
      ((e as HTMLElement).innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name') || (e as HTMLInputElement).value || '').trim().toLowerCase()[0]).join(''));
    expect(labels).toHaveLength(TOTAL);
    expect(labels.every((l) => fits(l) || initials.includes(l[0])), 'generated labels use only the new letters').toBe(true);
    expect(PREFIX_FREE(labels)).toBe(true);
    await options.click('#reset-alphabet');
    await options.waitForTimeout(300);
    expect((await kh.settings()).alphabet).toBe('asdfghjklqwertyuiop');
  });

  test('a pasted address turns single keys off there; the list turns them back on', async ({ kh }) => {
    await kh.load();
    const options = await openOptions(kh);
    await options.fill('#new-site', 'http://localhost:8765/some/page');
    await options.press('#new-site', 'Enter');
    await kh.page.waitForTimeout(200);
    await kh.press('f');
    await kh.settle();
    expect(await kh.hints()).toHaveLength(0);
    await options.reload();
    await options.click('text=Turn on for localhost');
    await kh.page.waitForTimeout(200);
    await kh.press('f');
    await kh.settle();
    expect(await kh.hints()).toHaveLength(TOTAL);
  });

  test('"Forget all" asks first, then forgets', async ({ kh }) => {
    await kh.load();
    await kh.pick('#btn');
    const options = await openOptions(kh);
    const saved = (await kh.savedLabels()).length;
    await options.click('#forget-all');
    await options.waitForTimeout(150);
    expect(saved).toBeGreaterThan(0);
    expect(await kh.savedLabels()).toHaveLength(saved);
    expect(await options.textContent('#forget-all')).toMatch(/Click again/);
    await options.click('#forget-all');
    await options.waitForTimeout(300);
    expect(await kh.savedLabels()).toHaveLength(0);
  });

  test('a keymap round-trips through copy and paste', async ({ kh }) => {
    await kh.load();
    await kh.pick('#btn');
    const memo = await kh.memory();
    const keymap = JSON.stringify({ keyhints: 2, labels: { 'labels:localhost': memo } });
    const options = await openOptions(kh);
    await options.click('#forget-all');
    await options.click('#forget-all');
    await options.waitForTimeout(300);
    await options.fill('#import-text', keymap);
    await options.click('#import');
    await options.waitForTimeout(300);
    expect(await options.textContent('#status')).toMatch(/Added labels for localhost/);
    expect(Object.keys(await kh.memory())).toEqual(Object.keys(memo));
    await options.fill('#import-text', '{"keyhints":1,"labels":{}}');
    await options.click('#import');
    await options.waitForTimeout(200);
    expect(await options.textContent('#status')).toMatch(/Nothing imported/);
  });
});

test.describe('hint style', () => {
  test('size and colours from settings', async ({ kh }) => {
    const overlayVar = (name: string) => kh.evalPage((n) => (document.querySelector('keyhints-overlay') as HTMLElement).style.getPropertyValue(n), name);
    await kh.load('/nav');
    await kh.press('f');
    await kh.settle();
    expect(await overlayVar('--hint-size')).toBe('11px');
    expect(await overlayVar('--accent')).not.toBe('rgb(253, 224, 71)');
    await kh.press('Escape');
    const options = await openOptions(kh);
    await options.selectOption('#hint-size', 'large');
    await options.selectOption('#hint-colors', 'light');
    await kh.page.waitForTimeout(300);
    await kh.page.bringToFront();
    await kh.press('f');
    await kh.settle();
    expect(await overlayVar('--hint-size')).toBe('14px');
    expect(await overlayVar('--accent')).toBe('rgb(253, 224, 71)');
  });
});

test.describe('sync', () => {
  test('settings go up with their time; newer ones from another computer come down', async ({ kh }) => {
    await kh.load();
    await kh.toggleSite(); // a settings change
    await kh.page.waitForTimeout(300);
    const up = await kh.synced('settings');
    expect(up.value.disabledSites).toContain('localhost');
    await kh.sw.evaluate((s) => chrome.storage.sync.set({ settings: { value: { ...s.value, hintSize: 'small' }, at: s.at + 1000 } }), up);
    await kh.page.waitForTimeout(300);
    expect((await kh.settings()).hintSize).toBe('small');
    await kh.sw.evaluate((s) => chrome.storage.sync.set({ settings: { value: { ...s.value, hintSize: 'large' }, at: 1 } }), up);
    await kh.page.waitForTimeout(300);
    expect((await kh.settings()).hintSize, 'an older change is ignored').toBe('small');
  });

  test('pins go up; another computer\'s pins and unpins come down, per element', async ({ kh }) => {
    await kh.load();
    await kh.press('f');
    await kh.settle();
    await kh.press('Shift+Digit1');
    await kh.typeLabel((await kh.labelFor('#refresh'))!);
    await kh.press('g');
    await kh.page.waitForTimeout(400);
    const pins = await kh.synced('pins:localhost');
    const [id, record] = Object.entries(pins)[0] as [string, any];
    expect(record).toMatchObject({ label: 'g', pinned: true });
    // Another computer unpins it, and pins something else.
    await kh.sw.evaluate(([i, r]) => chrome.storage.sync.set({ 'pins:localhost': {
      [i]: { ...r, pinned: false, at: r.at + 1000 },
      elsewhere: { label: 'q', name: 'Elsewhere', pinned: true, at: r.at + 1000 },
    } }), [id, record]);
    await kh.page.waitForTimeout(400);
    const memo = await kh.memory();
    expect(memo[id].pinned).toBe(false);
    expect(memo.elsewhere).toMatchObject({ label: 'q', pinned: true });
    // Forgetting the site here unpins its pins everywhere.
    const options = await openOptions(kh);
    await options.click('text=Forget localhost');
    await options.waitForTimeout(300);
    expect((await kh.synced('pins:localhost')).elsewhere.pinned).toBe(false);
  });
});

test.describe('learning from mouse clicks', () => {
  test('a click that did something is learned; plain text teaches nothing; the palette forgets', async ({ kh }) => {
    const learned = async () => (await kh.local('learned:localhost'))['learned:localhost'] || [];
    await kh.load('/learn');
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#jsbtn')).toBeUndefined();
    await kh.press('Escape');
    await kh.page.click('#plaintext');
    await kh.page.waitForTimeout(700);
    expect(await learned()).toEqual([]);
    await kh.page.click('#jsbtn');
    await kh.page.waitForTimeout(800);
    expect(await kh.toastText()).toMatch(/put a hint on that/);
    expect(await learned()).toHaveLength(1);
    expect((await learned())[0]).toContain('open-panel');
    await kh.load('/learn');
    await kh.press('f');
    await kh.settle();
    expect(await kh.labelFor('#jsbtn')).toBeTruthy();
    await kh.press('Escape');
    await kh.runPalette('forget clicks learned here');
    expect(await learned()).toEqual([]);
    expect(await kh.toastText()).toMatch(/Forgot 1 learned/);
  });
});

test.describe('the ? key sheet', () => {
  test('opens, Esc closes, "? ?" lets the second reach the site; ? in hint mode opens it too', async ({ kh }) => {
    await kh.load('/nav');
    await kh.press('?');
    await kh.settle();
    expect(await kh.nodeText('help')).toMatch(/Single keys.*next \/ previous page/);
    await kh.press('Escape');
    await kh.settle();
    expect(await kh.nodeText('help')).toBe('');
    await kh.press('?', '?');
    await kh.settle();
    expect(await kh.nodeText('help')).toBe('');
    expect(await kh.evalPage(() => (window as any).pageKeys)).toEqual(['?']);
    await kh.press('f');
    await kh.settle();
    await kh.press('Shift+Slash');
    await kh.settle();
    expect(await kh.nodeText('help')).not.toBe('');
    expect(await kh.hints()).toHaveLength(0);
  });
});

test.describe('tips', () => {
  test('a tip shows once, ever, and "show them again" brings it back', async ({ kh }) => {
    await kh.page.goto('https://www.youtube.com/');
    await kh.page.waitForTimeout(500);
    expect(await kh.nodeText('tip')).toMatch(/leaves youtube\.com's own single keys alone/);
    await kh.page.reload();
    await kh.page.waitForTimeout(500);
    expect(await kh.nodeText('tip')).toBe('');
    const options = await openOptions(kh);
    await options.click('#tips-reset');
    await options.waitForTimeout(200);
    await kh.page.bringToFront();
    await kh.page.reload();
    await kh.page.waitForTimeout(500);
    expect(await kh.nodeText('tip')).not.toBe('');
  });
});
