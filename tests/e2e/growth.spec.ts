// First run, as a user installs it: the real manifest (bookmarks and history not granted), the
// welcome page, Show keys, the settings page's stats, sharing and backup.
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserOptions, KH } from './harness';

const SITE = 'http://localhost:8775';
let context: BrowserContext, sw: Worker, server: Server, welcome: Page | undefined;
const errors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<body style="margin:20px"><a href="#a">Alpha</a> <input id="field"></body>');
  }).listen(8775, '127.0.0.1');
  const ext = join(import.meta.dirname, '..', '..', '.output', 'chrome-mv3');
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'keyhints-growth-')), {
    ...browserOptions(), headless: true, viewport: { width: 1000, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  for (let i = 0; i < 30 && !welcome; i++) {
    welcome = context.pages().find((p) => p.url().endsWith('/welcome.html'));
    if (!welcome) await new Promise((r) => setTimeout(r, 100));
  }
});
test.afterAll(async () => {
  await context.close();
  server.close();
});

async function kh(page: Page) {
  page.on('pageerror', (e) => errors.push(e.message));
  return new KH(context, page, sw, await context.newCDPSession(page));
}

test('installing opens the welcome page, where hints, practice and the palette work', async () => {
  expect(welcome, 'the welcome page opened by itself').toBeTruthy();
  const k = await kh(welcome!);
  await welcome!.waitForLoadState();
  await welcome!.waitForTimeout(300);
  expect(await welcome!.locator('.hintkey kbd').first().textContent()).toBe('Alt+J');
  await welcome!.mouse.click(990, 790);
  await k.press('f');
  await k.settle();
  const explore = await k.labelFor('#pad1 button:text("Explore")');
  expect(explore, 'Explore gets e from its name').toBe('e');
  await k.typeLabel(explore!);
  await k.settle();
  expect(await welcome!.locator('#done1').textContent()).toMatch(/without touching the mouse/);
  for (let i = 0; i < 3; i++) await k.pick('#home');
  expect(await welcome!.locator('#done2').textContent()).toMatch(/^✓/);
  await k.press('?');
  await k.settle();
  expect(await k.nodeText('help')).toMatch(/f HHome/);
  await k.press('Escape');
  await k.altJ();
  await k.settle();
  expect((await k.hints()).length, 'Alt+J (a browser command) works on the welcome page').toBeGreaterThan(0);
  await k.press('Escape');
  expect(await welcome!.locator('#grant').isVisible(), 'bookmarks and history are not granted on install').toBe(true);
  await welcome!.locator('#keycast').check();
  await welcome!.waitForTimeout(300);
  expect((await k.local('settings')).settings.keycast).toBe(true);
});

test('the palette offers to allow bookmark and history search', async () => {
  const page = await context.newPage();
  const k = await kh(page);
  await page.goto(SITE);
  await page.mouse.click(990, 790);
  await k.sendToTab('open-palette');
  await k.settle();
  await page.keyboard.type('bookmarks', { delay: 40 });
  await page.waitForTimeout(300);
  expect((await k.results()).some((r) => /allow in settings/.test(r.text!))).toBe(true);
  await k.press('Escape');
});

test('Show keys: shows keys and chords, never what is typed in a field, clears, and turns off', async () => {
  const page = context.pages().find((p) => p.url().startsWith(SITE))!;
  const k = await kh(page);
  const keycast = async () => (await k.overlayNodes()).filter((n) => n.kind === 'keycast');
  await page.bringToFront();
  await page.waitForTimeout(1700); // the badge from opening the palette before clears
  await page.mouse.click(990, 790);
  await k.press('x');
  await k.settle();
  expect((await keycast())[0]?.text).toBe('x');
  await page.waitForTimeout(1700);
  expect(await keycast()).toHaveLength(0);
  await page.locator('#field').focus();
  await page.keyboard.type('secret');
  await k.settle();
  expect(await keycast(), 'typed text is never shown').toHaveLength(0);
  await k.press('Control+a');
  await k.settle();
  expect((await keycast())[0]?.text, 'chords are').toBe('Ctrl+A');
  await page.waitForTimeout(1700);
  await welcome!.locator('#keycast').uncheck();
  await page.waitForTimeout(300);
  await page.mouse.click(990, 790);
  await k.press('x');
  await k.settle();
  expect(await page.evaluate(() => document.querySelectorAll('keyhints-overlay').length)).toBe(0);
});

test('settings: stats, a pasted keymap (your own entry wins), a refused paste, backup, stats image, search state, tips', async () => {
  await sw.evaluate(() => chrome.storage.local.set({
    'labels:example.com': {
      a: { label: 'h', name: 'Home', used: 1, uses: 5 },
      b: { label: 'qw', name: 'Help', used: 2, uses: 4 },
    },
    'labels:github.com': { mine: { label: 'z', name: 'Mine', used: 9, uses: 2 } },
  }));
  const k = await kh(welcome!);
  const options = await k.openOptions();
  options.on('pageerror', (e) => errors.push(e.message));
  expect(await options.textContent('#stats')).toMatch(/^1\d clicks without the mouse · \d buttons? with a key of their own, on \d sites? · Most used on /);
  await options.fill('#import-text', JSON.stringify({ keyhints: 2, labels: { 'labels:github.com': {
    pulls: { label: 'p', name: 'Pull requests', used: 1, uses: 1 },
    mine: { label: 'y', name: 'Theirs', used: 1, uses: 1 },
  } } }));
  await options.click('#import');
  await options.waitForTimeout(300);
  const gh = (await k.local('labels:github.com'))['labels:github.com'];
  expect(gh.pulls.label, 'a pasted keymap is added').toBe('p');
  expect(gh.mine.label, 'your own entry wins over the imported one').toBe('z');
  await options.fill('#import-text', 'not json at all');
  await options.click('#import');
  await options.waitForTimeout(200);
  expect(await options.textContent('#status')).toMatch(/Nothing imported/);
  const [backupFile] = await Promise.all([options.waitForEvent('download'), options.click('#export')]);
  const backup = JSON.parse(readFileSync((await backupFile.path())!, 'utf8'));
  expect(backup.keyhints).toBe(2);
  expect(Object.keys(backup.labels).sort()).toEqual(['labels:example.com', 'labels:github.com']);
  expect(backup.settings).toBeTruthy();
  const [image] = await Promise.all([options.waitForEvent('download'), options.click('#stats-image')]);
  expect(image.suggestedFilename()).toBe('keyhints-keys.png');
  expect(await options.textContent('#search-state')).toMatch(/not searched/);
  await options.locator('#tips').uncheck();
  await options.waitForTimeout(300);
  expect((await k.local('settings')).settings.tips).toBe(false);
  await options.click('#tips-reset');
  await options.waitForTimeout(300);
  expect((await k.local('tipsSeen')).tipsSeen).toEqual([]);
  expect((await k.local('settings')).settings.tips).toBe(true);
});

test('no uncaught errors on the welcome, settings and site pages', () => {
  expect(errors).toEqual([]);
});
