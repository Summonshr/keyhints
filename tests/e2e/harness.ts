// End-to-end harness: the built extension (.output/chrome-mv3) in headless Chromium, fixture pages
// on http://localhost:8765 and fake https sites (YouTube, Netflix, Google, GitHub, Jira) on 8766.
// One browser per worker; every test starts with fresh storage and a single tab.

import { test as base, expect, chromium, type BrowserContext, type CDPSession, type Page, type Worker } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as P from './pages';

export const ORIGIN = 'http://localhost:8765';

// The system Chromium where there is one (/usr/bin/chromium), else Playwright's own (CI:
// `npx playwright install chromium`). CHROMIUM_PATH overrides both.
export const browserOptions = (): { executablePath?: string; channel?: string } => {
  const path = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : '');
  return path ? { executablePath: path } : { channel: 'chromium' };
};
export const PREFIX_FREE = (ls: string[]) => ls.every((a) => ls.every((b) => a === b || !b.startsWith(a)));

// Every hint on the fixture page ('/'), and inside its iframe.
export const EXPECTED = ['#toplink', '#link1', '#link2', '#link3', '#text', '#email', '#area', '#editor', '#sel', '#btn', '#check',
  '#refresh', '#like1', '#like2', '[data-t=rid]', '#remember', '#wrap', '#hovbtn', '#mute', '#card', '#inner'];
export const FRAME_EXPECTED = ['#fbtn', '#flink', '#finput'];
export const TOTAL = EXPECTED.length + FRAME_EXPECTED.length;

function startServers(): Server[] {
  // localhost counts as a secure context, so the clipboard API works there.
  const http = createServer((req, res) => {
    // /slow.png holds the page's load event for 3 s (hints must work before the page has loaded).
    if (req.url === '/slow.png') return void setTimeout(() => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(); }, 3000);
    res.writeHead(200, { 'content-type': 'text/html' });
    const page = P.fixture.replace('RANDOMID', `radix-${Math.random().toString(36).slice(2, 8)}`); // a new id on every load
    // /shifted: same page with new links on top and a different number in the button text.
    const shifted = page
      .replace('<body>', '<body><div class="row"><a id="new1" href="/n1">New 1</a> <a id="new2" href="/n2">New 2</a></div>')
      .replace('Show 35 posts', 'Show 12 posts');
    // /many: 300 links on screen at once.
    const many = '<body style="margin:0;display:grid;align-content:start;grid-template-columns:repeat(20,50px);font:10px sans-serif">' +
      Array.from({ length: 300 }, (_, i) => `<a href="/m${i}" style="height:40px">L${i}</a>`).join('');
    const pages: Record<string, string> = { '/': page, '/shifted': shifted, '/many': many, '/frame': P.framePage, '/big': P.big, '/feed': P.feed,
      '/pager': P.pager, '/pager2': P.pager2, '/nav': P.nav, '/names': P.names, '/xfeed': P.xfeed, '/learn': P.learnPage, '/nav2': P.nav2,
      '/slowpage': P.slowPage, '/bf': P.bfPage, '/ctx': P.ctxPage };
    res.end(pages[req.url!] || `<h1>${req.url}</h1>`);
  });
  http.listen(8765, '127.0.0.1');

  // Fake https sites (hosts mapped to this machine, throwaway self-signed certificate).
  const certDir = mkdtempSync(join(tmpdir(), 'keyhints-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=www.youtube.com',
    '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')], { stdio: 'ignore' });
  const clip = readFileSync(join(P.fixtureDir, 'media', 'clip.webm')); // 5 minutes
  const https = createHttpsServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) }, (req, res) => {
    if (req.url!.startsWith('/media/')) { // byte ranges, so the video can seek
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      const start = m ? Number(m[1]) : 0, end = m && m[2] ? Number(m[2]) : clip.length - 1;
      res.writeHead(m ? 206 : 200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': end - start + 1,
        ...(m ? { 'content-range': `bytes ${start}-${end}/${clip.length}` } : {}) });
      return void res.end(clip.subarray(start, end + 1));
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    const host = req.headers.host!;
    if (host.startsWith('www.google.com') && req.url!.startsWith('/search')) return void res.end(P.googleSearch);
    if (req.url!.startsWith('/results')) return void res.end(P.youtubeResults);
    if (req.url!.startsWith('/watch?v=list')) return void res.end(P.youtubeWatchList);
    if (req.url!.startsWith('/watch')) return void res.end(host.startsWith('www.netflix.com') ? P.netflixWatch : P.youtubeWatch);
    if (host.startsWith('github.com')) return void res.end(P.githubPull);
    if (host.startsWith('example.atlassian.net')) return void res.end(P.jiraIssue);
    res.end(P.fixture.replace('RANDOMID', 'yt'));
  });
  https.listen(8766, '127.0.0.1');
  return [http, https];
}

// A scratch copy of the built extension with bookmarks and history granted at install: they're
// optional permissions, and the browser's grant prompt can't be clicked headless.
function extensionCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), 'keyhints-ext-'));
  cpSync(join(import.meta.dirname, '..', '..', '.output', 'chrome-mv3'), dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  manifest.permissions.push(...manifest.optional_permissions);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

export interface Hint { label: string; atX: number; atY: number; left: number; top: number; hidden: boolean; used: boolean; inFrame: boolean; nodeId: number }
type OverlayNode = { kind: string; text?: string; on?: boolean } & Partial<Hint>;

// What every test drives: the main tab, the service worker, and helpers.
export class KH {
  constructor(public context: BrowserContext, public page: Page, public sw: Worker, private cdp: CDPSession) {}

  async load(path = '/') {
    await this.page.goto(`${ORIGIN}${path}`);
    await this.page.waitForTimeout(150);
    await this.page.mouse.click(990, 790); // focus the page body, not an input
  }

  settle = () => this.page.waitForTimeout(120);
  evalPage = <T, A = undefined>(fn: (arg: A) => T, arg?: A) => this.page.evaluate(fn as never, arg) as Promise<Awaited<T>>;

  async press(...keys: string[]) {
    for (const k of keys) await this.page.keyboard.press(k);
  }

  async typeLabel(label: string, { shiftLast = false } = {}) {
    for (let i = 0; i < label.length; i++) {
      await this.page.keyboard.press(shiftLast && i === label.length - 1 ? `Shift+${label[i].toUpperCase()}` : label[i]);
    }
  }

  // The overlay lives in closed shadow roots (also inside iframes); CDP can pierce them.
  async overlayNodes(): Promise<OverlayNode[]> {
    const { root } = await this.cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const found: OverlayNode[] = [];
    type N = { nodeType: number; nodeValue: string; nodeId: number; attributes?: string[]; children?: N[]; shadowRoots?: N[]; contentDocument?: N };
    // Palette results keep titles and addresses in data-text (drawn by CSS), not in text nodes.
    const drawn = (n: N) => { const a = n.attributes || []; const i = a.indexOf('data-text'); return i >= 0 && i % 2 === 0 ? a[i + 1] : ''; };
    const text = (n: N): string => (n.nodeType === 3 ? n.nodeValue : drawn(n) + (n.children || []).map(text).join(''));
    (function walk(n: N, inFrame: boolean) {
      const a = n.attributes || [];
      const attrs: Record<string, string> = {};
      for (let i = 0; i < a.length; i += 2) attrs[a[i]] = a[i + 1];
      const cls = (attrs.class || '').split(' ');
      if (cls.includes('hint')) {
        const [atX, atY] = attrs['data-at'].split(',').map(Number);
        const num = (re: RegExp) => parseFloat(re.exec(attrs.style)![1]);
        found.push({ kind: 'hint', label: text(n), atX, atY, left: num(/left:\s*(-?[\d.]+)px/), top: num(/top:\s*(-?[\d.]+)px/),
          hidden: cls.includes('hidden'), used: cls.includes('used'), inFrame, nodeId: n.nodeId });
      }
      if (cls.includes('bar') || cls.includes('toast')) found.push({ kind: cls.includes('bar') ? 'bar' : 'toast', text: text(n) });
      if (['ring', 'palette', 'osd', 'help', 'chip', 'tip', 'keycast'].some((c) => cls.includes(c))) found.push({ kind: cls[0], text: text(n) });
      if (cls.includes('result')) found.push({ kind: 'result', text: text(n), on: cls.includes('on') });
      if (n.contentDocument) walk(n.contentDocument, true);
      for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) walk(c, inFrame);
    })(root as unknown as N, false);
    return found;
  }

  // A drawn hint's size, by its CDP node id.
  box = async (nodeId: number) => (await this.cdp.send('DOM.getBoxModel', { nodeId })).model;

  hints = async () => (await this.overlayNodes()).filter((n) => n.kind === 'hint') as Hint[];
  visibleHints = async () => (await this.hints()).filter((h) => !h.hidden);
  labels = async () => (await this.hints()).map((h) => h.label);
  barText = async () => (await this.overlayNodes()).find((n) => n.kind === 'bar')?.text || '';
  toastText = async () => (await this.overlayNodes()).filter((n) => n.kind === 'toast').map((n) => n.text).join(' | ');
  nodeText = async (kind: string) => (await this.overlayNodes()).find((n) => n.kind === kind)?.text || '';
  results = async () => (await this.overlayNodes()).filter((n) => n.kind === 'result');
  clipboard = () => this.page.evaluate(() => navigator.clipboard.readText());

  // The label of the hint sitting on this element (or on its text, for #para), if any.
  async labelFor(selector: string, { frame = false } = {}): Promise<string | undefined> {
    const target = frame ? this.page.frameLocator('#frm').locator(selector) : this.page.locator(selector);
    const rect = await target.first().evaluate((el) => {
      let r = el.getBoundingClientRect();
      if (el.id === 'para') { // text hints sit on the text itself
        const range = document.createRange();
        range.selectNodeContents(el.firstChild!);
        r = range.getClientRects()[0];
      }
      return { left: Math.round(r.left), top: Math.round(r.top) };
    });
    return (await this.hints()).find((h) => h.inFrame === frame && Math.abs(h.atX - rect.left) <= 1 && Math.abs(h.atY - rect.top) <= 1)?.label;
  }

  // Hints, then the label of `selector`.
  async pick(selector: string, opts: { shiftLast?: boolean } = {}) {
    await this.press('f');
    await this.settle();
    const label = await this.labelFor(selector);
    expect(label, `a hint on ${selector}`).toBeTruthy();
    await this.typeLabel(label!, opts);
    await this.settle();
    return label!;
  }

  // Opens the settings page in its own tab. (The browser reuses the current tab for it when that
  // tab is blank, so the test's tab is put on a real page first.)
  async openOptions(): Promise<Page> {
    if (this.page.url() === 'about:blank') await this.load();
    const [options] = await Promise.all([this.context.waitForEvent('page'), this.sw.evaluate(() => chrome.runtime.openOptionsPage())]);
    await options.waitForLoadState();
    await options.waitForTimeout(200);
    return options;
  }

  // What a browser shortcut or the toolbar button sends to the active tab.
  sendToTab = (type: string) => this.sw.evaluate(async (t) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.tabs.sendMessage(tab.id!, { type: t }, { frameId: 0 });
  }, type);
  altJ = () => this.sendToTab('toggle-hints');
  toggleSite = () => this.sendToTab('toggle-site');

  async runPalette(text: string) {
    await this.sendToTab('open-palette');
    await this.settle();
    await this.page.keyboard.type(text, { delay: 40 });
    await this.page.waitForTimeout(300);
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(400);
  }
  paletteOpen = async () => (await this.overlayNodes()).some((n) => n.kind === 'palette');

  activeTab = () => this.sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]);
  activeTabUrl = async () => (await this.activeTab()).url;
  activateUrl = (url: string) => this.sw.evaluate(async (u) => {
    const [t] = await chrome.tabs.query({ url: u });
    await chrome.tabs.update(t.id!, { active: true });
  }, url);
  tabUrls = () => this.sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.url));
  badge = () => this.sw.evaluate(async () => chrome.action.getBadgeText({ tabId: (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id }));

  // Storage, read and (for test setup only) written directly.
  local = (key: string | null = null) => this.sw.evaluate((k) => chrome.storage.local.get(k), key) as Promise<Record<string, any>>;
  memory = async (host = 'localhost') => (await this.local(`labels:${host}`))[`labels:${host}`] || {};
  savedLabels = async () => Object.entries(await this.local()).filter(([k]) => k.startsWith('labels:'))
    .flatMap(([, v]) => Object.values(v as Record<string, { label: string }>).map((e) => e.label));
  setLocal = (items: Record<string, unknown>) => this.sw.evaluate((i) => chrome.storage.local.set(i), items);
  settings = async () => (await this.local('settings')).settings || {};
  synced = (key: string) => this.sw.evaluate(async (k) => (await chrome.storage.sync.get(k))[k], key) as Promise<any>;
  commands = () => this.sw.evaluate(() => chrome.commands.getAll());
}

type World = { context: BrowserContext; sw: Worker; page: Page; cdp: CDPSession; errors: string[] };

export const test = base.extend<{ kh: KH }, { world: World }>({
  world: [async ({}, use) => {
    const servers = startServers();
    const ext = extensionCopy();
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'keyhints-')), {
      ...browserOptions(),
      headless: true,
      ignoreDefaultArgs: ['--disable-back-forward-cache'], // Playwright turns the cache off; users have it on
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`,
        '--host-resolver-rules=MAP www.youtube.com:443 127.0.0.1:8766, MAP www.google.com:443 127.0.0.1:8766, ' +
          'MAP www.netflix.com:443 127.0.0.1:8766, MAP github.com:443 127.0.0.1:8766, MAP example.atlassian.net:443 127.0.0.1:8766',
        '--ignore-certificate-errors'],
      viewport: { width: 1000, height: 800 },
    });
    for (const origin of [ORIGIN, 'https://github.com', 'https://example.atlassian.net', 'https://www.youtube.com']) {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    }
    const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    // The welcome page opens in its own tab on install; close it so tests start from one plain tab.
    for (let i = 0; i < 20 && !context.pages().some((p) => p.url().endsWith('/welcome.html')); i++) await new Promise((r) => setTimeout(r, 100));
    for (const p of context.pages()) if (p.url().endsWith('/welcome.html')) await p.close();
    const page = context.pages()[0] || await context.newPage();
    const cdp = await context.newCDPSession(page);
    // Uncaught errors from the content scripts (e.g. a forbidden state transition) land here.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use({ context, sw, page, cdp, errors });
    await context.close();
    servers.forEach((s) => s.close());
  }, { scope: 'worker' }],

  kh: async ({ world }, use) => {
    const { context, sw, page, cdp, errors } = world;
    // Fresh start: one tab, no saved data (the schema marks the data as this version's).
    for (const p of context.pages()) if (p !== page) await p.close();
    await page.bringToFront();
    await page.goto('about:blank');
    await sw.evaluate(async () => {
      const { schema } = await chrome.storage.local.get('schema');
      await chrome.storage.local.clear();
      await chrome.storage.sync.clear();
      await chrome.storage.local.set({ schema });
      await chrome.storage.sync.set({ schema });
      for (const g of await chrome.tabGroups.query({})) for (const t of await chrome.tabs.query({ groupId: g.id })) await chrome.tabs.ungroup(t.id!);
      for (const t of await chrome.tabs.query({ pinned: true })) await chrome.tabs.update(t.id!, { pinned: false });
      for (const t of await chrome.tabs.query({ muted: true })) await chrome.tabs.update(t.id!, { muted: false });
    });
    errors.length = 0;
    await use(new KH(context, page, sw, cdp));
    expect(errors, 'no uncaught errors from the extension').toEqual([]);
  },
});

export { expect };
