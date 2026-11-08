// Headless end-to-end test: loads the unpacked extension into Chromium and drives fixture pages.
import { chromium } from 'playwright-core';
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// A scratch copy of the extension with bookmarks and history granted at install: they're optional
// permissions, and the browser's grant prompt can't be clicked headless (growth.mjs tests the
// "not allowed yet" path on the real manifest).
const extPath = mkdtempSync(join(tmpdir(), 'keyhints-ext-'));
cpSync(join(here, '..'), extPath, { recursive: true, filter: (src) => !/[/\\](test|store|\.git)$/.test(src) });
const manifest = JSON.parse(readFileSync(join(extPath, 'manifest.json'), 'utf8'));
manifest.permissions.push(...manifest.optional_permissions);
writeFileSync(join(extPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
const fixture = readFileSync(join(here, 'fixture.html'), 'utf8');

const framePage = `<body style="margin:4px;font:14px sans-serif">
  <button id="fbtn" onclick="parent.postMessage('fbtn', '*')">Frame button</button>
  <a id="flink" href="/framelink">Frame link</a> <input id="finput"></body>`;

// /big: ~20k elements, for timing.
const big = '<body>' + Array.from({ length: 2000 }, (_, i) =>
  `<div class="r"><span>row ${i}</span><span>a</span><span>b</span><span>c</span><em>d</em><b>e</b>` +
  `${i % 10 === 0 ? `<a href="/b${i}">link ${i}</a>` : '<i>f</i>'}<small>g</small><u>h</u></div>`).join('') + '</body>';

// /feed: posts with like / reply buttons, a timestamp link, and a mute button that only shows on hover.
const feed = '<body style="font:14px sans-serif;margin:20px"><h1>Feed</h1>' + Array.from({ length: 6 }, (_, i) => `
  <article data-i="${i}" style="border:1px solid #ccc;margin:10px 0;padding:10px;height:200px">
    <a href="/post/${i}"><time>${i}h</time></a> <span>Post number ${i}</span>
    <div><button aria-label="Like" data-testid="like" onclick="window.acts=(window.acts||[]).concat('like${i}')">♥</button>
      <button aria-label="Reply" onclick="window.acts=(window.acts||[]).concat('reply${i}')">↩</button></div>
    <div class="vid" onmouseenter="this.querySelector('button').style.display='inline-block'" style="display:inline-block">
      <video style="width:200px;height:60px;background:#333"></video>
      <button aria-label="Mute" style="display:none" onclick="window.acts=(window.acts||[]).concat('mute${i}')">🔈</button></div>
  </article>`).join('') + '</body>';

// /pager: a "Next ›" link far below the fold; /pager2: only a rel=prev link.
const logKeys = `<script>addEventListener('keydown', (e) => { window.pageKeys = (window.pageKeys || []).concat(e.key); });</script>`;
const pager = `<meta charset="utf-8"><body style="font:14px sans-serif"><h1>Page 1</h1><div style="height:3000px"></div>
  <a href="/other">Other</a> <a href="/pager2">Next ›</a>${logKeys}</body>`;
const pager2 = `<body style="font:14px sans-serif"><h1>Page 2</h1><a rel="prev" href="/pager">1</a></body>`;
// /nav: an X-like sidebar plus enough other links that fresh labels take two keys.
const nav = `<body style="font:14px sans-serif;margin:10px"><nav>
  <a id="home" href="#home">Home</a> <a id="explore" href="#explore">Explore</a> <a id="notif" href="#notifications">Notifications</a></nav>
  <div style="display:grid;grid-template-columns:repeat(10,80px)">${Array.from({ length: 40 }, (_, i) => `<a href="#f${i}">Filler ${i}</a>`).join('')}</div>
  ${logKeys}</body>`;
// /xfeed: X-like posts: counts on the action bar's label, the post's words in tweetText.
const xfeed = '<body style="font:14px sans-serif;margin:20px">' + Array.from({ length: 4 }, (_, i) => `
  <article style="border:1px solid #ccc;margin:10px 0;padding:10px;height:220px;background:#fff">
    <a href="/status/${i}"><time>${i}h</time></a><div data-testid="tweetText">Hello post ${i}</div>
    <div role="group" aria-label="1 reply, 3 reposts, ${10 + i} likes, 2 bookmarks, 95${i} views">
      <button aria-label="1 Reply. Reply">↩</button> <button aria-label="${10 + i} Likes. Like">♥</button></div>
  </article>`).join('') + '</body>';
// Fake github.com pull request files ("changes" view) and a fake Jira issue.
const githubPull = `<!doctype html><body style="margin:0;font:14px sans-serif">
  <header style="position:sticky;top:0;height:60px;background:#eee">GitHub</header>
  ${['a.php', 'b.php', 'c.php'].map((f, i) => `<div role="region" id="diff-${i}" style="height:900px;border-top:2px solid #999">
    <div data-file-path="${f}">${f} <button aria-pressed="false" aria-label="Not Viewed"
      onclick="const v = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', v); this.setAttribute('aria-label', v ? 'Viewed' : 'Not Viewed')">Viewed</button></div>
    ${i === 1 ? '<div data-testid="review-thread" style="margin-top:400px">Looks wrong</div>' : ''}</div>`).join('')}
  <div style="height:1200px"></div>${logKeys}</body>`;
const jiraIssue = `<!doctype html><body><h1>ABC-42 Fix the thing</h1>${logKeys}</body>`;

// localhost counts as a secure context, so the clipboard API works there.
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  const page = fixture.replace('RANDOMID', `radix-${Math.random().toString(36).slice(2, 8)}`); // a new id on every load
  // /shifted: same page with new links on top and a different number in the button text.
  const shifted = page
    .replace('<body>', '<body><div class="row"><a id="new1" href="/n1">New 1</a> <a id="new2" href="/n2">New 2</a></div>')
    .replace('Show 35 posts', 'Show 12 posts');
  // /many: 300 links on screen at once.
  const many = '<body style="margin:0;display:grid;align-content:start;grid-template-columns:repeat(20,50px);font:10px sans-serif">' +
    Array.from({ length: 300 }, (_, i) => `<a href="/m${i}" style="height:40px">L${i}</a>`).join('');
  const pages = { '/': page, '/shifted': shifted, '/many': many, '/frame': framePage, '/big': big, '/feed': feed,
    '/pager': pager, '/pager2': pager2, '/nav': nav, '/xfeed': xfeed };
  res.end(pages[req.url] || `<h1>${req.url}</h1>`);
});
await new Promise((resolve) => server.listen(8765, '127.0.0.1', resolve));
const ORIGIN = 'http://localhost:8765';

// A fake https://www.youtube.com (host mapped to this machine, throwaway self-signed certificate),
// to test the built-in "site has its own keys" list. YouTube is HTTPS-only, so plain http won't do.
const certDir = mkdtempSync(join(tmpdir(), 'keyhints-cert-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=www.youtube.com',
  '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')], { stdio: 'ignore' });
// Fake watch pages. Both log keys that reach the page, and have a search box and a comment box.
const clip = readFileSync(join(here, 'media', 'clip.webm')); // 5 minutes
const watchPage = (extra) => `<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px sans-serif">
  <input id="search" placeholder="Search"> <div id="comment" contenteditable="true" style="display:inline-block;min-width:100px">c</div>
  <video id="v" src="/media/clip.webm" preload="auto" muted style="display:block;width:800px;height:450px;background:#000"></video>
  ${extra}
  <script>addEventListener('keydown', (e) => { window.pageKeys = (window.pageKeys || []).concat(e.key); });</script></body>`;
const youtubeWatch = watchPage(`<button class="ytp-ad-skip-button-modern" style="display:none"
  onclick="window.skipped = true">Skip</button>`);
const netflixWatch = watchPage(`
  <button data-uia="player-skip-intro" style="display:none" onclick="window.skipped = true">Skip Intro</button>
  <button data-uia="next-episode-seamless-button" style="display:none" onclick="window.nexted = true">Next Episode</button>
  <script>
    // Stub of Netflix's player API; records seeks. Any write to video.currentTime is counted (M7375).
    const v = document.getElementById('v');
    window.seeks = [];
    window.currentTimeWrites = 0;
    Object.defineProperty(v, 'currentTime', { get: () => HTMLMediaElement.prototype.__lookupGetter__('currentTime').call(v), set: () => { window.currentTimeWrites++; } });
    const player = { getCurrentTime: () => v.currentTime * 1000, getDuration: () => v.duration * 1000, seek: (ms) => window.seeks.push(ms) };
    window.netflix = { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: {
      getAllPlayerSessionIds: () => ['watch-123'], getVideoPlayerBySessionId: () => player } }) } } } };
  </script>`);
const httpsServer = createHttpsServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) },
  (req, res) => {
    if (req.url.startsWith('/media/')) { // byte ranges, so the video can seek
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      const start = m ? Number(m[1]) : 0, end = m && m[2] ? Number(m[2]) : clip.length - 1;
      res.writeHead(m ? 206 : 200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': end - start + 1,
        ...(m ? { 'content-range': `bytes ${start}-${end}/${clip.length}` } : {}) });
      return res.end(clip.subarray(start, end + 1));
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    const host = req.headers.host;
    if (req.url.startsWith('/watch')) return res.end(host.startsWith('www.netflix.com') ? netflixWatch : youtubeWatch);
    if (host.startsWith('github.com')) return res.end(githubPull);
    if (host.startsWith('example.atlassian.net')) return res.end(jiraIssue);
    res.end(fixture.replace('RANDOMID', 'yt'));
  });
await new Promise((resolve) => httpsServer.listen(8766, '127.0.0.1', resolve));

// The welcome page opens in its own tab on install; close it so tests start from one plain tab.
async function closeWelcome(context) {
  for (let i = 0; i < 20; i++) {
    const welcome = context.pages().find((p) => p.url().endsWith('/welcome.html'));
    if (welcome) return welcome.close();
    await new Promise((r) => setTimeout(r, 100));
  }
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
  if (!ok) failures++;
}
const prefixFree = (ls) => ls.every((a) => ls.every((b) => a === b || !b.startsWith(a)));

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'keyhints-')), {
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`,
    '--host-resolver-rules=MAP www.youtube.com:443 127.0.0.1:8766, MAP www.netflix.com:443 127.0.0.1:8766, MAP github.com:443 127.0.0.1:8766, MAP example.atlassian.net:443 127.0.0.1:8766',
    '--ignore-certificate-errors'],
  viewport: { width: 1000, height: 800 },
});
for (const origin of [ORIGIN, 'https://github.com', 'https://example.atlassian.net']) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
}

const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
await closeWelcome(context);
const page = context.pages()[0] || await context.newPage();
const cdp = await context.newCDPSession(page);
// Uncaught errors from the content scripts (e.g. a forbidden state transition) land here.
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// The overlay lives in closed shadow roots (also inside iframes); CDP can pierce them.
async function overlayNodes() {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const found = [];
  const text = (n) => (n.nodeType === 3 ? n.nodeValue : (n.children || []).map(text).join(''));
  (function walk(n, inFrame) {
    const attrs = Object.fromEntries((n.attributes || []).reduce((acc, v, i, a) => (i % 2 ? acc : acc.concat([[v, a[i + 1]]])), []));
    const cls = (attrs.class || '').split(' ');
    if (cls.includes('hint')) {
      const [atX, atY] = attrs['data-at'].split(',').map(Number);
      const num = (re) => parseFloat(re.exec(attrs.style)[1]);
      found.push({ kind: 'hint', label: text(n), atX, atY, left: num(/left:\s*(-?[\d.]+)px/), top: num(/top:\s*(-?[\d.]+)px/),
        hidden: cls.includes('hidden'), used: cls.includes('used'), inFrame, nodeId: n.nodeId });
    }
    if (cls.includes('bar') || cls.includes('toast')) found.push({ kind: cls.includes('bar') ? 'bar' : 'toast', text: text(n) });
    if (['ring', 'palette', 'osd', 'help', 'chip'].some((c) => cls.includes(c))) found.push({ kind: cls[0], text: text(n) });
    if (cls.includes('result')) found.push({ kind: 'result', text: text(n), on: cls.includes('on') });
    const kids = [...(n.children || []), ...(n.shadowRoots || [])];
    if (n.contentDocument) walk(n.contentDocument, true);
    for (const c of kids) walk(c, inFrame);
  })(root, false);
  return found;
}
const getHints = async () => (await overlayNodes()).filter((n) => n.kind === 'hint');
const visibleHints = async () => (await getHints()).filter((h) => !h.hidden);
const barText = async () => ((await overlayNodes()).find((n) => n.kind === 'bar') || {}).text || '';
const toastText = async () => (await overlayNodes()).filter((n) => n.kind === 'toast').map((n) => n.text).join(' | ');

async function labelFor(selector, { frame = false } = {}) {
  const target = frame ? page.frameLocator('#frm').locator(selector) : page.locator(selector);
  const rect = await target.evaluate((el) => {
    let r = el.getBoundingClientRect();
    if (el.id === 'para') { // text hints sit on the text itself
      const range = document.createRange();
      range.selectNodeContents(el.firstChild);
      r = range.getClientRects()[0];
    }
    return { left: Math.round(r.left), top: Math.round(r.top) };
  });
  const hint = (await getHints()).find((h) => h.inFrame === frame && Math.abs(h.atX - rect.left) <= 1 && Math.abs(h.atY - rect.top) <= 1);
  return hint && hint.label;
}

async function load(path = '/') {
  await page.goto(`${ORIGIN}${path}`);
  await page.waitForTimeout(150);
  await page.mouse.click(990, 790); // focus the page body, not an input
}

const evalPage = (fn, arg) => page.evaluate(fn, arg);
const altJ = () => sw.evaluate(async () => toggleHints((await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]));
const typeLabel = async (label, { shiftLast = false } = {}) => {
  for (let i = 0; i < label.length; i++) {
    await page.keyboard.press(shiftLast && i === label.length - 1 ? `Shift+${label[i].toUpperCase()}` : label[i]);
  }
};
const settle = () => page.waitForTimeout(120);

const expected = ['#toplink', '#link1', '#link2', '#link3', '#text', '#email', '#area', '#editor', '#sel', '#btn', '#check',
  '#refresh', '#like1', '#like2', '[data-t=rid]', '#remember', '#wrap', '#hovbtn', '#mute', '#card', '#inner'];
const frameExpected = ['#fbtn', '#flink', '#finput'];
const TOTAL = expected.length + frameExpected.length;

// ===== hints appear on the right things =====
await load();
await page.keyboard.press('f');
await settle();
const hints = await getHints();
for (const sel of expected) check(`hint shown for ${sel}`, !!(await labelFor(sel)));
for (const sel of frameExpected) check(`hint shown inside iframe for ${sel}`, !!(await labelFor(sel, { frame: true })));
for (const sel of ['#behind', '#offscreen', '#hidden-link', '#disabled', '#ariadis', 'label[for=remember]']) {
  check(`no hint for ${sel}`, !(await labelFor(sel)));
}
check('hint count exact (no duplicates for label+checkbox or card span)', hints.length === TOTAL, `got ${hints.length}: ${hints.map((h) => h.label)}`);
const labels = hints.map((h) => h.label);
check('labels are prefix-free and unique across page and iframe', prefixFree(labels) && new Set(labels).size === labels.length, labels.join(','));

// #1 hints fully on screen, even for an element touching the top edge
const pageHints = (await getHints()).filter((x) => !x.inFrame); // fresh node ids
const offscreenHints = [];
for (const h of pageHints) {
  const box = (await cdp.send('DOM.getBoxModel', { nodeId: h.nodeId })).model;
  h.w = box.width; h.h = box.height;
  if (h.left < 0 || h.top < 0 || h.left + h.w > 1000 || h.top + h.h > 800) offscreenHints.push(h.label);
}
check('every hint fully inside the viewport (top-edge link not cut off)', offscreenHints.length === 0, offscreenHints.join(','));
// #15 no overlapping hints
const overlaps = [];
for (const a of pageHints) for (const b of pageHints) {
  if (a !== b && a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top) overlaps.push(`${a.label}/${b.label}`);
}
check('no two hints overlap', overlaps.length === 0, overlaps.join(' '));

const { root: domRoot } = await cdp.send('DOM.getDocument', { depth: 2 });
const overlayStyle = (await cdp.send('DOM.getOuterHTML', { nodeId: (await cdp.send('DOM.querySelector', { nodeId: domRoot.nodeId, selector: 'keyhints-overlay' })).nodeId })).outerHTML;
check('accent taken from site link colour', overlayStyle.includes('--accent: rgb(0, 0, 238)'), overlayStyle);
check('mode bar shows CLICK and the mode keys', /CLICK/.test(await barText()) && /copy link/.test(await barText()), await barText());

// Esc, Backspace, partial typing
await page.keyboard.press('Escape');
check('Esc removes hints', (await getHints()).length === 0);
await page.keyboard.press('f');
await settle();
const twoChar = (await getHints()).find((h) => h.label.length === 2);
if (twoChar) {
  await page.keyboard.press(twoChar.label[0]);
  await settle();
  const visible = await visibleHints();
  check('typing first char narrows hints (iframe too)', visible.every((h) => h.label.startsWith(twoChar.label[0])) && visible.length < labels.length);
  await page.keyboard.press('Backspace');
  await settle();
  check('Backspace restores all hints', (await visibleHints()).length === labels.length);
}
await page.keyboard.press('Escape');

// #2 Ctrl shortcuts and Tab cancel hints and pass through
await page.keyboard.press('f');
await page.keyboard.press('Control+a');
check('Ctrl+key cancels hints', (await getHints()).length === 0);
check('...and reaches the page', await evalPage(() => window.gotCtrl === true));
await page.keyboard.press('f');
await page.keyboard.press('Tab');
check('Tab cancels hints', (await getHints()).length === 0);

// #3 "y" expires
await load();
await page.keyboard.press('y');
await page.waitForTimeout(1100);
await page.keyboard.press('f');
await settle();
check('"y" then a late "f" is plain click mode', /^CLICK/.test(await barText()), await barText());
await page.keyboard.press('Escape');

// ===== focusing fields =====
for (const [sel, prop] of [['#text', 'value'], ['#area', 'value'], ['#editor', 'textContent']]) {
  await load();
  await page.keyboard.press('f');
  await settle();
  const label = await labelFor(sel);
  await typeLabel(label);
  const focused = await evalPage(() => document.activeElement.id);
  check(`${sel} focused via hint`, focused === sel.slice(1), `active=${focused}`);
  await page.keyboard.type('XY');
  const val = await page.locator(sel).evaluate((el, p) => el[p], prop);
  check(`${sel} receives typing after focus (caret at end)`, val.endsWith('XY') && !val.includes(label), `value=${JSON.stringify(val)}`);
}
for (const sel of ['#email', '#sel']) {
  await load();
  await page.keyboard.press('f');
  await settle();
  await typeLabel(await labelFor(sel));
  check(`${sel} focused via hint`, (await evalPage(() => document.activeElement.id)) === sel.slice(1));
}

// ===== clicks =====
for (const [sel, verify] of [
  ['#btn', () => window.clicked?.includes('btn') && window.mousedown],
  ['#check', () => document.getElementById('check').checked],
  ['#remember', () => document.getElementById('remember').checked],
  ['#card', () => window.clicked?.includes('card')],
  ['#inner', () => window.clicked?.includes('shadow')],
  ['#wrap', () => window.clicked?.includes('inner-handler')], // #5 handler on an inner span
]) {
  await load();
  await page.keyboard.press('f');
  await settle();
  await typeLabel(await labelFor(sel));
  check(`${sel} clicked via hint`, await evalPage(verify));
}
for (const [sel, url] of [['#link1', '/page2'], ['#link3', '/page4']]) {
  await load();
  await page.keyboard.press('f');
  await settle();
  await Promise.all([page.waitForURL(`${ORIGIN}${url}`, { timeout: 3000 }), typeLabel(await labelFor(sel))]).catch(() => {});
  check(`${sel} click navigates${sel === '#link3' ? ' (click lands on inner span)' : ''}`, page.url() === `${ORIGIN}${url}`, page.url());
}

// #4 element re-rendered between showing hints and picking
await load();
await page.keyboard.press('f');
await settle();
const btnLabel = await labelFor('#btn');
await evalPage(() => { const b = document.getElementById('btn'); b.replaceWith(b.cloneNode(true)); });
await typeLabel(btnLabel);
check('re-rendered element is found again and clicked', await evalPage(() => window.clicked?.includes('btn')));
await load();
await page.keyboard.press('f');
await settle();
const goneLabel = await labelFor('#like1');
await evalPage(() => document.getElementById('like1').remove());
await typeLabel(goneLabel);
check('vanished element gives a clear message', /page changed/i.test(await toastText()), await toastText());

// "f" inside an input is just a letter
await load();
await page.locator('#text').focus();
await page.keyboard.press('End');
await page.keyboard.type('f');
check('"f" inside input types normally', (await page.locator('#text').inputValue()) === 'abcf' && (await getHints()).length === 0);

// ===== modes =====
// Shift+F
await load();
await page.keyboard.press('Shift+F');
await settle();
check('Shift+F shows only links (page + iframe)', (await visibleHints()).length === 5, `got ${(await visibleHints()).length}`);
let [newPage] = await Promise.all([context.waitForEvent('page'), typeLabel(await labelFor('#link2'))]);
await newPage.waitForLoadState();
check('Shift+F opens new tab with link URL', newPage.url() === `${ORIGIN}/page3`, newPage.url());
const tabState = await sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => ({ index: t.index, active: t.active })));
check('new tab opened in background, right after current', JSON.stringify(tabState.sort((a, b) => a.index - b.index)) ===
  JSON.stringify([{ index: 0, active: true }, { index: 1, active: false }]), JSON.stringify(tabState));
await newPage.close();

// #16 Shift on the last letter
await load();
await page.keyboard.press('f');
await settle();
[newPage] = await Promise.all([context.waitForEvent('page'), typeLabel(await labelFor('#link1'), { shiftLast: true })]);
await newPage.waitForLoadState();
check('Shift on last letter opens link in background tab', newPage.url() === `${ORIGIN}/page2` && page.url() === `${ORIGIN}/`, newPage.url());
await newPage.close();

// "c" after Alt+J copies the link; labels stay the same when switching
await load();
await altJ();
await settle();
const beforeC = await labelFor('#link2');
await page.keyboard.press('c');
await settle();
check('pressing c switches to COPY LINK mode', /^COPY LINK/.test(await barText()), await barText());
check('labels stay the same after pressing c', (await labelFor('#link2')) === beforeC);
check('only links remain visible in copy mode', (await visibleHints()).length === 5);
await typeLabel(beforeC);
await settle();
check('Alt+J, c, label copies the link and does not open it', (await evalPage(() => navigator.clipboard.readText())) === `${ORIGIN}/page3` && page.url() === `${ORIGIN}/`);
// yf still copies
await load();
await page.keyboard.press('y');
await page.keyboard.press('f');
await settle();
await typeLabel(await labelFor('#link1'));
await settle();
check('yf copies link URL', (await evalPage(() => navigator.clipboard.readText())) === `${ORIGIN}/page2`);
// pressing c twice goes back to click
await load();
await page.keyboard.press('f');
await page.keyboard.press('c');
await page.keyboard.press('c');
await settle();
check('pressing c again returns to CLICK', /^CLICK/.test(await barText()), await barText());
await page.keyboard.press('Escape');

// ";", and ";" inside hint mode: focus only
for (const how of [[';'], ['f', ';']]) {
  await load();
  for (const k of how) await page.keyboard.press(k);
  await settle();
  await typeLabel(await labelFor('#btn'));
  check(`${how.join(' ')}: focuses button without clicking`, (await evalPage(() => document.activeElement.id)) === 'btn' && !(await evalPage(() => window.clicked)));
}

// #10 hover
await load();
await page.keyboard.press('f');
await page.keyboard.press('v');
await settle();
check('v switches to HOVER', /^HOVER/.test(await barText()));
await typeLabel(await labelFor('#hovbtn'));
check('hover opens a JS hover menu', await evalPage(() => !document.getElementById('menupanel').hidden));

// #11 open several
await load();
await page.keyboard.press('f');
await page.keyboard.press('m');
await settle();
const pagesBefore = context.pages().length;
await typeLabel(await labelFor('#link1'));
await settle();
check('multi mode stays open after a pick', /^OPEN SEVERAL/.test(await barText()) && (await getHints()).some((h) => h.used));
await typeLabel(await labelFor('#link2'));
await page.waitForTimeout(400);
check('multi mode opened two background tabs', context.pages().length === pagesBefore + 2, `${context.pages().length - pagesBefore}`);
await page.keyboard.press('Escape');
for (const p of context.pages().slice(1)) await p.close();

// #9 scrollable panels
await load();
await page.keyboard.press('f');
await page.keyboard.press('x');
await settle();
check('x switches to SCROLL PANEL', /^SCROLL PANEL/.test(await barText()), await barText());
await typeLabel(await labelFor('#panel'));
check('panel focused', (await evalPage(() => document.activeElement.id)) === 'panel');
await page.keyboard.press('PageDown');
await page.waitForTimeout(300);
check('PageDown scrolls the focused panel', (await evalPage(() => document.getElementById('panel').scrollTop)) > 0);

// #12 select text
await load();
await page.keyboard.press('f');
await page.keyboard.press('z');
await settle();
check('z switches to SELECT TEXT', /^SELECT TEXT/.test(await barText()), await barText());
await typeLabel(await labelFor('#para'));
await settle();
check('caret mode shown', /^CARET/.test(await barText()), await barText());
await page.keyboard.press('v');
for (let i = 0; i < 5; i++) await page.keyboard.press('l');
await page.keyboard.press('y');
await settle();
check('v + l×5 + y copies "Hello"', (await evalPage(() => navigator.clipboard.readText())) === 'Hello', await evalPage(() => navigator.clipboard.readText()));
await page.keyboard.press('f');
await page.keyboard.press('z');
await settle();
await typeLabel(await labelFor('#para'));
for (let i = 0; i < 6; i++) await page.keyboard.press('l');
await page.keyboard.press('v');
await page.keyboard.press('w');
await page.keyboard.press('y');
await settle();
check('caret moves, then v + w selects a word: "world"', (await evalPage(() => navigator.clipboard.readText())) === 'world', await evalPage(() => navigator.clipboard.readText()));

// #14 filter by text
await load();
await page.keyboard.press('f');
await page.keyboard.press('/');
await page.keyboard.type('posts');
await settle();
check('filter narrows to matching text', (await visibleHints()).length === 1 && /1 match/.test(await barText()), await barText());
await page.keyboard.press('Enter');
check('Enter picks the only match', await evalPage(() => window.clicked?.includes('refresh')));

// #13 iframes
await load();
await page.keyboard.press('f');
await settle();
await typeLabel(await labelFor('#fbtn', { frame: true }));
await page.waitForTimeout(200);
check('button inside iframe clicked via hint', (await evalPage(() => window.frameMessages || [])).includes('fbtn'));
await load();
await page.keyboard.press('f');
await page.keyboard.press('c');
await settle();
await typeLabel(await labelFor('#flink', { frame: true }));
await settle();
check('link inside iframe copied', (await evalPage(() => navigator.clipboard.readText())) === `${ORIGIN}/framelink`);
await load();
await page.keyboard.press('f');
await settle();
await typeLabel(await labelFor('#finput', { frame: true }));
await page.waitForTimeout(200);
await page.keyboard.type('hey');
const frameInput = await page.frameLocator('#frm').locator('#finput').inputValue();
check('input inside iframe focused and typed into', frameInput === 'hey', JSON.stringify(frameInput));

// ===== Alt+J =====
const commands = await sw.evaluate(() => chrome.commands.getAll());
check('Alt+J bound to show-hints', commands.find((c) => c.name === 'show-hints')?.shortcut === 'Alt+J', JSON.stringify(commands));
await load();
await page.locator('#area').focus();
await altJ();
await settle();
check('Alt+J shows hints while typing in textarea', (await getHints()).length === TOTAL);
await typeLabel(await labelFor('#text'));
check('Alt+J -> label moves focus to #text', (await evalPage(() => document.activeElement.id)) === 'text');
check('label keys did not leak into textarea', (await page.locator('#area').inputValue()) === '');
await altJ(); await settle();
check('Alt+J again toggles hints on', (await getHints()).length > 0);
await altJ(); await settle();
check('Alt+J a third time toggles hints off', (await getHints()).length === 0);

await load();
await page.keyboard.press('f');
await evalPage(() => window.scrollBy(0, 100));
await settle();
check('scroll exits hint mode', (await getHints()).length === 0);

// ===== remembered labels =====
await load();
await page.keyboard.press('f');
await settle();
const refreshLabel = await labelFor('#refresh');
const ridLabel = await labelFor('[data-t=rid]');
await typeLabel(refreshLabel);
await settle();
await page.keyboard.press('f');
await settle();
await typeLabel(await labelFor('[data-t=rid]'));
await settle();
await load('/shifted');
await page.keyboard.press('f');
await settle();
const shiftedLabels = (await getHints()).map((h) => h.label);
check('"Show 12 posts" keeps the label "Show 35 posts" had, despite new links above', (await labelFor('#refresh')) === refreshLabel);
check('#7 button with a random id keeps its label across loads', (await labelFor('[data-t=rid]')) === ridLabel, `${ridLabel} -> ${await labelFor('[data-t=rid]')}`);
check('labels still prefix-free and unique with remembered ones', prefixFree(shiftedLabels) && new Set(shiftedLabels).size === shiftedLabels.length);
await page.keyboard.press('Escape');
await page.keyboard.press('f');
await settle();
await typeLabel(await labelFor('#like1'));
await settle();
const memo = (await sw.evaluate(() => chrome.storage.local.get('labels:localhost')))['labels:localhost'] || {};
check('refresh button remembered', Object.keys(memo).some((k) => k.includes('show # posts')));
check('stored labels are prefix-free', prefixFree(Object.values(memo).map((e) => e.label)));
// identical elements: the learned label goes to the copy nearest the centre of the screen
const likeEntry = Object.entries(memo).find(([k]) => k.includes('|like|'));
check('identical Like buttons are remembered once', !!likeEntry, Object.keys(memo).join('\n'));
await load();
await page.keyboard.press('f');
await settle();
const [l1, l2] = [await labelFor('#like1'), await labelFor('#like2')];
const nearer = await evalPage(() => {
  const d = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - innerWidth / 2, r.top + r.height / 2 - innerHeight / 2); };
  return d('like1') < d('like2') ? 'like1' : 'like2';
});
check('learned Like label sits on the copy nearest the centre, the other gets its own',
  (nearer === 'like1' ? l1 : l2) === likeEntry[1].label && l1 !== l2, `like1=${l1} like2=${l2} stored=${likeEntry[1].label} nearer=${nearer}`);
await page.keyboard.press('Escape');

// a button that renames itself (Mute <-> Unmute) keeps one label
await load();
await page.keyboard.press('f');
await settle();
const muteLabel = await labelFor('#mute');
await typeLabel(muteLabel);
await settle();
check('mute button toggled to Unmute', (await evalPage(() => document.getElementById('mute').getAttribute('aria-label'))) === 'Unmute');
await page.keyboard.press('f');
await settle();
check('Unmute keeps the label Mute had', (await labelFor('#mute')) === muteLabel, `${muteLabel} -> ${await labelFor('#mute')}`);
await page.keyboard.press('Escape');

// frequently picked elements earn a single key
await sw.evaluate(() => chrome.storage.local.remove('labels:localhost'));
await load();
await page.keyboard.press('f');
await settle();
let frequent = null;
for (const sel of ['#inner', '#card', '#mute', '#hovbtn', '#wrap', '[data-t=rid]', '#refresh', '#btn']) {
  const l = await labelFor(sel);
  if (l && l.length === 2) { frequent = { sel, label: l }; break; }
}
check('found a two-key element to use often', !!frequent);
await page.keyboard.press('Escape');
for (let i = 1; i <= 3; i++) {
  await page.keyboard.press('f');
  await settle();
  const before = await labelFor(frequent.sel);
  if (i < 3) check(`pick ${i}: still the two-key label`, before === frequent.label, before);
  await typeLabel(before);
  await settle();
}
check('third pick announces the new single key', /own key: [A-Z]$/.test(await toastText()), await toastText());
await page.keyboard.press('f');
await settle();
const promotedLabel = await labelFor(frequent.sel);
const afterPromotion = (await getHints()).map((h) => h.label);
check(`${frequent.sel} now has a single key`, promotedLabel && promotedLabel.length === 1, `${frequent.label} -> ${promotedLabel}`);
check('labels still prefix-free and unique after promotion', prefixFree(afterPromotion) && new Set(afterPromotion).size === afterPromotion.length, afterPromotion.join(','));
await page.keyboard.press('Escape');
await load('/shifted');
await page.keyboard.press('f');
await settle();
check('single key survives reload and layout change', (await labelFor(frequent.sel)) === promotedLabel);
await page.keyboard.press('Escape');
const promoMemo = (await sw.evaluate(() => chrome.storage.local.get('labels:localhost')))['labels:localhost'];
check('promoted entry counts its uses', Object.values(promoMemo).some((e) => e.label === promotedLabel && e.uses >= 3), JSON.stringify(promoMemo));

// all single keys remembered for off-screen elements: no dead end
await sw.evaluate(() => chrome.storage.local.set({ 'labels:localhost': Object.fromEntries(
  [...'asdfghjklqwertyuiop'].map((c, i) => [`FAKE|${c}`, { label: c, used: i + 1 }])) }));
await load();
await page.keyboard.press('f');
await settle();
const blocked = (await getHints()).map((h) => h.label);
check('hints still shown when all single keys are remembered', blocked.length === TOTAL, `got ${blocked.length}`);
check('...at most two keys, prefix-free', blocked.every((l) => l.length <= 2) && prefixFree(blocked), blocked.join(','));
await page.keyboard.press('Escape');
await settle();
const afterForget = Object.keys((await sw.evaluate(() => chrome.storage.local.get('labels:localhost')))['labels:localhost']);
check('only the oldest memories were forgotten', afterForget.length > 0 && afterForget.length < 19 && !afterForget.includes('FAKE|a') && afterForget.includes('FAKE|p'), afterForget.join(','));

// 300 links
await load('/many');
await page.keyboard.press('f');
await settle();
const manyLabels = (await getHints()).map((h) => h.label);
check('300 links all get hints', manyLabels.length === 300, `got ${manyLabels.length}`);
check('no three-key labels with 300 links', manyLabels.every((l) => l.length <= 2));
check('300 labels prefix-free and unique', new Set(manyLabels).size === 300 && prefixFree(manyLabels));
await page.keyboard.press('Escape');

// #17 speed on a 20k-element page
await page.bringToFront(); // background tabs get deprioritised, which would skew the timing
await load('/big');
const elements = await evalPage(() => document.getElementsByTagName('*').length);
// Timed inside the page (key sent -> overlay added), so harness polling isn't counted. Median of 5.
const times = [];
for (let i = 0; i < 5; i++) {
  await evalPage(() => {
    window.__ms = undefined;
    window.__t0 = performance.now();
    new MutationObserver((_, obs) => {
      if (document.querySelector('keyhints-overlay')) { window.__ms = performance.now() - window.__t0; obs.disconnect(); }
    }).observe(document.documentElement, { childList: true });
  });
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__ms !== undefined);
  times.push(Math.round(await evalPage(() => window.__ms)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
}
const ms = times.sort((a, b) => a - b)[2];
console.log(`      (hints on a ${elements}-element page: ${times.join(', ')} ms; median ${ms} ms)`);
check('hints appear within 100 ms on a 20k-element page (median)', ms < 100, `${ms} ms`);
await page.keyboard.press('Escape');

// ===== Alt+M =====
check('Alt+M bound to toggle-mute', commands.find((c) => c.name === 'toggle-mute')?.shortcut === 'Alt+M');
const mutedAfter = () => sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await toggleMute(tab);
  return (await chrome.tabs.get(tab.id)).mutedInfo;
});
const m1 = await mutedAfter();
check('Alt+M mutes the tab (by extension, not a site setting)', m1.muted === true && m1.reason === 'extension', JSON.stringify(m1));
check('Alt+M again unmutes it', (await mutedAfter()).muted === false);

// ===== #19 toolbar button: per-site switch with badge =====
await load();
const toggleSite = () => sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'toggle-site' }, { frameId: 0 }); // what the toolbar click sends
});
const badge = () => sw.evaluate(async () => chrome.action.getBadgeText({ tabId: (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id }));
await toggleSite();
await page.waitForTimeout(200);
check('toolbar toggle: badge says off', (await badge()) === 'off', await badge());
await page.keyboard.press('f');
await settle();
check('bare f does nothing on a switched-off site', (await getHints()).length === 0);
await altJ(); await settle();
check('Alt+J still works on a switched-off site', (await getHints()).length > 0);
await page.keyboard.press('Escape');
await load();
check('switch survives reload (badge still off)', (await badge()) === 'off');
await toggleSite();
await page.waitForTimeout(200);
await page.keyboard.press('f');
await settle();
check('toolbar toggle again: badge cleared, f works', (await badge()) === '' && (await getHints()).length > 0);
await page.keyboard.press('Escape');

// ===== #18 options page =====
await page.keyboard.press('f');
await settle();
await page.keyboard.press('Shift+Slash');
await settle();
check('? in hint mode shows the key sheet, like ? outside it', (await overlayNodes()).some((n) => n.kind === 'help') && (await getHints()).length === 0);
await page.keyboard.press('Escape');
await settle();
const [optionsPage] = await Promise.all([context.waitForEvent('page'), sw.evaluate(() => chrome.runtime.openOptionsPage())]);
await optionsPage.waitForLoadState();
await optionsPage.waitForTimeout(200);
const shortcutsText = await optionsPage.textContent('#shortcuts');
check('options: shortcuts read from the browser', /Alt\+J/.test(shortcutsText) && /Alt\+K/.test(shortcutsText), shortcutsText);
const sitesText = await optionsPage.textContent('#sites');
check('options: built-in sites in the one "single keys off" list', /youtube\.com.*off/.test(sitesText), sitesText);
await optionsPage.fill('#alphabet', 'asdc');
await optionsPage.click('#save-alphabet');
check('options: mode letters rejected in alphabet', /switch modes/.test(await optionsPage.textContent('#status')), await optionsPage.textContent('#status'));
await optionsPage.fill('#alphabet', 'asdn');
await optionsPage.press('#alphabet', 'Enter');
await optionsPage.waitForTimeout(200);
check('options: n is allowed, Enter saves', (await sw.evaluate(() => chrome.storage.local.get('settings'))).settings.alphabet === 'asdn',
  await optionsPage.textContent('#status'));
const savedLabels = async () => Object.entries(await sw.evaluate(() => chrome.storage.local.get(null)))
  .filter(([k]) => k.startsWith('labels:')).flatMap(([, v]) => Object.values(v).map((e) => e.label));
await optionsPage.fill('#alphabet', 'asdfghjklqwertyuiop');
await optionsPage.click('#save-alphabet');
await optionsPage.waitForTimeout(200);
await sw.evaluate(async () => { // one saved label that uses letters about to be removed
  const { 'labels:localhost': m } = await chrome.storage.local.get('labels:localhost');
  await chrome.storage.local.set({ 'labels:localhost': { ...m, 'A||||||||/nowhere|nowhere': { label: 'qw', used: 1, uses: 1 } } });
});
const labelsBefore = await savedLabels();
const fitsNew = (l) => l.length === 1 || /^[asdfjkl]+$/.test(l);
await optionsPage.fill('#alphabet', 'asdfjkl');
await optionsPage.click('#save-alphabet');
await optionsPage.waitForTimeout(200);
const labelsAfter = await savedLabels();
check('options: new letters keep the saved labels that still fit, forget the rest',
  labelsBefore.some((l) => !fitsNew(l)) && labelsAfter.length === labelsBefore.filter(fitsNew).length && labelsAfter.every(fitsNew),
  `${labelsBefore.join(',')} -> ${labelsAfter.join(',')} (${await optionsPage.textContent('#status')})`);
await page.bringToFront();
await load();
await page.keyboard.press('f');
await settle();
const custom = (await getHints()).map((h) => h.label);
check('hints use only the new letters (or kept single keys)', custom.length === TOTAL && custom.every(fitsNew) && prefixFree(custom), custom.join(','));
await page.keyboard.press('Escape');
await optionsPage.fill('#new-site', 'http://localhost:8765/some/page');
await optionsPage.press('#new-site', 'Enter');
await page.waitForTimeout(200);
await page.keyboard.press('f');
await settle();
check('options: pasting an address + Enter turns single keys off there', (await getHints()).length === 0);
await optionsPage.reload();
await optionsPage.click('text=Turn on for localhost');
await optionsPage.click('#reset-alphabet');
await page.waitForTimeout(200);
await page.keyboard.press('f');
await settle();
const restored = (await getHints()).map((h) => h.label);
check('options: site back on and default letters restored', restored.length === TOTAL && restored.some((l) => /[ghqwe]/.test(l)), restored.join(','));
await page.keyboard.press('Escape');
const keptLabels = (await savedLabels()).length;
await optionsPage.click('#forget-all');
await optionsPage.waitForTimeout(150);
check('options: first click on "Forget all" only asks to confirm', keptLabels > 0 && (await savedLabels()).length === keptLabels &&
  /Click again/.test(await optionsPage.textContent('#forget-all')), await optionsPage.textContent('#forget-all'));
// Labels are used again below; restore them after checking the second click.
const labelStore = await sw.evaluate(async () => Object.fromEntries(Object.entries(await chrome.storage.local.get(null)).filter(([k]) => k.startsWith('labels:'))));
await optionsPage.click('#forget-all');
await optionsPage.waitForTimeout(150);
check('options: second click forgets them', (await savedLabels()).length === 0);
await sw.evaluate((store) => chrome.storage.local.set(store), labelStore);
await optionsPage.close();

// ===== a tab without KeyHints: the toolbar button says why nothing happened =====
{
  const bare = await context.newPage();
  await bare.goto('chrome://version');
  const res = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'chrome://version/' });
    await toPage(tab, { type: 'toggle-site' });
    return { text: await chrome.action.getBadgeText({ tabId: tab.id }), title: await chrome.action.getTitle({ tabId: tab.id }) };
  });
  check('no content script: badge "!" and a reason', res.text === '!' && /can't be used/.test(res.title), JSON.stringify(res));
  await bare.close();
  await page.bringToFront();
}

// ===== repeat (.) and pin (!) =====
await load();
await page.keyboard.press('f');
await settle();
await typeLabel(await labelFor('#btn'));
await page.keyboard.press('f');
await settle();
await page.keyboard.press('.');
await settle();
check('. repeats the last pick', (await evalPage(() => (window.clicked || []).filter((c) => c === 'btn').length)) === 2);
await load();
await page.keyboard.press('f');
await settle();
await page.keyboard.press('Shift+Digit1'); // "!"
await settle();
check('! starts pinning', /PIN A KEY/.test(await barText()), await barText());
await typeLabel(await labelFor('#refresh'));
await settle();
check('pinning asks for the letter', /press the letter/.test(await barText()), await barText());
await page.keyboard.press('g');
await settle();
check('pin confirmed', /Pinned: .* → G/.test(await toastText()), await toastText());
await load('/shifted');
await page.keyboard.press('f');
await settle();
check('pinned key sticks across reload and layout change', (await labelFor('#refresh')) === 'g', await labelFor('#refresh'));
const pinnedAll = (await getHints()).map((h) => h.label);
check('labels prefix-free with a pinned key', prefixFree(pinnedAll) && new Set(pinnedAll).size === pinnedAll.length);
await page.keyboard.press('Escape');

// ===== post mode (Alt+I) =====
const sendToTab = (type) => sw.evaluate(async (t) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: t }, { frameId: 0 });
}, type);
const acts = () => evalPage(() => window.acts || []);
await load('/feed');
await sendToTab('item-mode');
await settle();
check('Alt+I highlights a post', (await overlayNodes()).some((n) => n.kind === 'ring') && /^POST/.test(await barText()), await barText());
await page.keyboard.press('l');
await settle();
const first = Number(((await acts())[0] || '').replace('like', ''));
check('l likes the highlighted post', (await acts()).length === 1 && /^like\d$/.test((await acts())[0]), JSON.stringify(await acts()));
await page.keyboard.press('j');
await page.waitForTimeout(250);
await page.keyboard.press('l');
await settle();
check('j moves to the next post', (await acts()).at(-1) === `like${first + 1}`, JSON.stringify(await acts()));
await page.keyboard.press('k');
await page.keyboard.press('k');
await page.waitForTimeout(250);
await page.keyboard.press('r');
await settle();
check('k k moves back two, r replies there', (await acts()).at(-1) === `reply${first - 1}`, JSON.stringify(await acts()));
await page.keyboard.press('m');
await page.waitForTimeout(400);
check('m finds a hover-only mute button and presses it', (await acts()).at(-1) === `mute${first - 1}`, JSON.stringify(await acts()));
await page.keyboard.press('c');
await settle();
check('c copies the post link', (await evalPage(() => navigator.clipboard.readText())) === `${ORIGIN}/post/${first - 1}`);
await page.keyboard.press('f');
await settle();
check('f shows hints only inside the post', (await visibleHints()).length === 4, `got ${(await visibleHints()).length}`); // link, like, reply, (now visible) mute
await page.keyboard.press('Escape');
await sendToTab('item-mode');
await settle();
await Promise.all([page.waitForURL(/\/post\/\d/, { timeout: 3000 }), page.keyboard.press('o')]).catch(() => {});
check('o opens the post', /\/post\/\d$/.test(page.url()), page.url());

// ===== command palette (Alt+K) =====
const paletteOpen = async () => (await overlayNodes()).some((n) => n.kind === 'palette');
await load();
await sendToTab('open-palette');
await settle();
check('Alt+K opens the palette', await paletteOpen());
await page.keyboard.type('scroll down', { delay: 60 });
await settle();
check('palette ranks the matching command first', /scroll down/i.test(((await overlayNodes()).find((n) => n.kind === 'result' && n.on) || {}).text || ''));
await page.keyboard.press('Enter');
await settle();
check('Enter runs it and closes the palette', (await evalPage(() => scrollY)) > 0 && !(await paletteOpen()));
await load();
await sendToTab('open-palette');
await settle();
await page.keyboard.type('page 3', { delay: 60 });
await settle();
await Promise.all([page.waitForURL(`${ORIGIN}/page3`, { timeout: 3000 }), page.keyboard.press('Enter')]).catch(() => {});
check('palette clicks a link on the page by its text', page.url() === `${ORIGIN}/page3`, page.url());
await load();
await sendToTab('open-palette');
await settle();
await page.keyboard.type('xyz', { delay: 60 });
await page.keyboard.press('Escape');
check('Esc closes the palette and keys never reach the page', !(await paletteOpen()) && !(await evalPage(() => window.clicked)));
// tabs, bookmarks, history
const other = await context.newPage();
await other.goto(`${ORIGIN}/tabtwo`);
await page.bringToFront();
await load();
await sendToTab('open-palette');
await settle();
await page.keyboard.type('tabtwo', { delay: 60 });
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const activeUrl = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].url);
check('palette switches to an open tab', activeUrl === `${ORIGIN}/tabtwo`, activeUrl);
await other.close();
await page.bringToFront();
await sw.evaluate((url) => chrome.bookmarks.create({ title: 'KeyHints bookmark test', url }), `${ORIGIN}/bm`);
await load();
await sendToTab('open-palette');
await settle();
await page.keyboard.type('keyhints bookmark', { delay: 60 });
await page.waitForTimeout(300);
await Promise.all([page.waitForURL(`${ORIGIN}/bm`, { timeout: 3000 }), page.keyboard.press('Enter')]).catch(() => {});
check('palette opens a bookmark', page.url() === `${ORIGIN}/bm`, page.url());
await load();
await sendToTab('open-palette');
await settle();
await page.keyboard.type('page2', { delay: 60 });
await page.waitForTimeout(300);
await Promise.all([page.waitForURL(`${ORIGIN}/page2`, { timeout: 3000 }), page.keyboard.press('Enter')]).catch(() => {});
check('palette opens a page from history', page.url() === `${ORIGIN}/page2`, page.url());
// voice: dictated text arrives all at once and runs by itself; typed text waits for Enter
await load();
await sendToTab('open-palette');
await settle();
await page.keyboard.insertText('Scroll down.');
await page.waitForTimeout(1300);
check('dictated command runs by itself', (await evalPage(() => scrollY)) > 0 && !(await paletteOpen()));
await load();
await sendToTab('open-palette');
await settle();
await page.keyboard.type('scroll down', { delay: 70 });
await page.waitForTimeout(1300);
check('typed command waits for Enter', (await evalPage(() => scrollY)) === 0 && (await paletteOpen()));
await page.keyboard.press('Escape');
await load();
await sendToTab('open-palette');
await settle();
await page.keyboard.insertText('scroll down');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(1300);
check('a key press stops a pending voice run', (await evalPage(() => scrollY)) === 0 && (await paletteOpen()));
await page.keyboard.press('Escape');

// ===== built-in "site has its own keys" list (fake https://www.youtube.com) =====
await page.goto('https://www.youtube.com/');
await page.waitForTimeout(200);
await page.mouse.click(990, 790);
await page.keyboard.press('f');
await settle();
check('youtube: bare f is left to the site', (await getHints()).length === 0);
check('youtube: badge says off', (await badge()) === 'off', await badge());
await altJ(); await settle();
check('youtube: Alt+J still works', (await getHints()).length > 0);
await page.keyboard.press('Escape');
await toggleSite();
await page.waitForTimeout(200);
await page.keyboard.press('f');
await settle();
check('youtube: toolbar button turns KeyHints single keys on', (await getHints()).length > 0 && (await badge()) === '');
await page.keyboard.press('Escape');
await toggleSite();
await page.waitForTimeout(200);
check('youtube: toolbar button gives the keys back to the site', (await badge()) === 'off' &&
  !(await sw.evaluate(() => chrome.storage.local.get('settings'))).settings.enabledSites.includes('www.youtube.com'));

// ===== video controls =====
const osdText = async () => ((await overlayNodes()).find((n) => n.kind === 'osd') || {}).text || '';
const video = (prop) => evalPage((p) => document.getElementById('v')[p], prop);
async function openWatch(host) {
  await page.goto(`https://${host}/watch?v=1`);
  await page.waitForFunction(() => document.getElementById('v').readyState >= 1 && document.getElementById('v').duration > 0);
  await page.mouse.click(990, 790);
}
// YouTube
await openWatch('www.youtube.com');
await page.keyboard.press(']');
await settle();
check('youtube ] seeks +30s', Math.round(await video('currentTime')) === 30, await video('currentTime'));
check('...and shows "+30s · 0:30"', /\+30s · 0:30/.test(await osdText()), await osdText());
await page.keyboard.press('}');
await settle();
check('youtube } seeks +60s', Math.round(await video('currentTime')) === 90);
await page.keyboard.press('[');
await page.keyboard.press('{');
await settle();
check('youtube [ and { seek back 30s and 60s', Math.round(await video('currentTime')) === 0, await video('currentTime'));
await page.keyboard.press('>');
await page.keyboard.press('>');
await settle();
check('youtube > > speeds up to 1.5×', (await video('playbackRate')) === 1.5 && /1\.5×/.test(await osdText()), `${await video('playbackRate')} ${await osdText()}`);
for (let i = 0; i < 10; i++) await page.keyboard.press('>');
check('speed stops at 3×', (await video('playbackRate')) === 3);
for (let i = 0; i < 12; i++) await page.keyboard.press('<');
check('speed stops at 0.5×', (await video('playbackRate')) === 0.5);
await page.keyboard.press('>');
await page.keyboard.press('>');
await page.keyboard.press('>'); // 1.25×
await evalPage(() => { document.getElementById('v').src = '/media/clip.webm?next'; }); // new video: the browser resets speed to 1×
await page.waitForFunction(() => document.getElementById('v').readyState >= 1);
await settle();
check('speed survives a new video / ad (single-page app)', (await video('playbackRate')) === 1.25, await video('playbackRate'));
await page.keyboard.press('5');
await page.keyboard.press('Shift+N');
await settle();
check('youtube keeps its own 0–9 and Shift+N', (await evalPage(() => window.pageKeys || [])).includes('5') && (await evalPage(() => window.pageKeys)).includes('N') && Math.round(await video('currentTime')) === 0);
await page.locator('#search').focus();
await page.keyboard.type(']>s');
await page.locator('#comment').focus();
await page.keyboard.press('End');
await page.keyboard.type('[');
check('never fires while typing in a search box or comment', (await page.locator('#search').inputValue()) === ']>s' &&
  (await page.locator('#comment').textContent()) === 'c[' && Math.round(await video('currentTime')) === 0 && (await video('playbackRate')) === 1.25);
await page.mouse.click(990, 790);
await page.keyboard.press('s');
await page.waitForTimeout(400);
check('s with no skip button says so', /No skip button/.test(await osdText()), await osdText());
await evalPage(() => { document.querySelector('.ytp-ad-skip-button-modern').style.display = 'inline-block'; });
await page.keyboard.press('s');
await settle();
check('s clicks the ad Skip button', await evalPage(() => window.skipped === true));
await page.keyboard.press('Shift+T');
await settle();
check('Shift+T shows time and time left', /\/ 5:00 · .* left/.test(await osdText()), await osdText());
await altJ(); await settle();
check('hint bar leaves out the video keys (they don\'t work while hints show)', !/±30s/.test(await barText()), await barText());
await page.keyboard.press('Escape');
await altJ(); await settle();
await page.keyboard.press('Shift+Slash'); // bare ? is YouTube's own; from hint mode it opens our sheet
await settle();
check('the ? sheet lists the video keys', /±30s/.test(((await overlayNodes()).find((n) => n.kind === 'help') || {}).text || ''));
await page.keyboard.press('Escape');
await sendToTab('open-palette');
await settle();
check('empty palette with a video on screen starts with the video commands',
  /skip intro/i.test(((await overlayNodes()).find((n) => n.kind === 'result' && n.on) || {}).text || ''),
  (await overlayNodes()).filter((n) => n.kind === 'result').map((n) => n.text).join(' | '));
await page.keyboard.type('forward 30', { delay: 60 });
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await settle();
check('palette: "forward 30" seeks', Math.round(await video('currentTime')) === 30, await video('currentTime'));
// Netflix
await openWatch('www.netflix.com');
await page.keyboard.press(']');
await settle();
check('netflix ] seeks +30s through the player API', JSON.stringify(await evalPage(() => window.seeks)) === '[30000]', JSON.stringify(await evalPage(() => window.seeks)));
await page.keyboard.press('5');
await settle();
check('netflix 5 jumps to 50%', (await evalPage(() => window.seeks.at(-1))) === 150000, await evalPage(() => window.seeks.at(-1)));
check('netflix: video.currentTime is never written (error M7375)', (await evalPage(() => window.currentTimeWrites)) === 0);
await page.keyboard.press('>');
check('netflix > speeds up', (await video('playbackRate')) === 1.25);
await evalPage(() => { document.querySelector('[data-uia="player-skip-intro"]').style.display = 'inline-block'; document.querySelector('[data-uia="next-episode-seamless-button"]').style.display = 'inline-block'; });
await page.keyboard.press('s');
await page.keyboard.press('Shift+N');
await settle();
check('netflix s skips the intro and Shift+N goes to the next episode', await evalPage(() => window.skipped === true && window.nexted === true));
await page.keyboard.press('f');
await settle();
check('netflix: bare f is left to Netflix (fullscreen)', (await getHints()).length === 0 && (await evalPage(() => window.pageKeys || [])).includes('f'));

// ===== single keys go to the first letter of the name (H for Home, N for Notifications) =====
await sw.evaluate(() => chrome.storage.local.remove('labels:localhost'));
const pickOn = async (sel) => {
  await page.keyboard.press('f');
  await settle();
  const label = await labelFor(sel);
  await typeLabel(label);
  await settle();
  return label;
};
await load('/nav');
for (let i = 0; i < 3; i++) await pickOn('#notif');
check('Notifications earns N', /own key: N$/.test(await toastText()), await toastText());
await page.keyboard.press('f');
await settle();
check('...and shows N in hint mode (a letter outside the hint alphabet)', (await labelFor('#notif')) === 'n', await labelFor('#notif'));
await page.keyboard.press('n');
await settle();
check('pressing n picks Notifications (n is no longer a mode key)', page.url().endsWith('#notifications'), page.url());
for (let i = 0; i < 3; i++) await pickOn('#home');
check('Home earns H', /own key: H$/.test(await toastText()), await toastText());
// Home learned T under the old rule: it moves to H on its next pick.
await sw.evaluate(async () => {
  const { 'labels:localhost': memo } = await chrome.storage.local.get('labels:localhost');
  for (const e of Object.values(memo)) if (e.label === 'h') e.label = 't';
  await chrome.storage.local.set({ 'labels:localhost': memo });
});
await load('/nav');
const before = await pickOn('#home');
check('an old single key that is not the initial moves to it', before === 't' && /own key: H$/.test(await toastText()), `${before} ${await toastText()}`);
await page.keyboard.press('f');
await settle();
const navLabels = (await getHints()).map((h) => h.label);
check('Home on H again, labels prefix-free', (await labelFor('#home')) === 'h' && prefixFree(navLabels), navLabels.join(','));
await page.keyboard.press('Escape');

// ===== ]] [[ follow the page's own Next / Previous links =====
await load('/pager');
await page.keyboard.press(']');
await page.keyboard.press(']');
await page.waitForURL(`${ORIGIN}/pager2`, { timeout: 3000 }).catch(() => {});
check(']] follows a "Next ›" link below the fold', page.url() === `${ORIGIN}/pager2`, page.url());
await page.mouse.click(990, 790);
await page.keyboard.press('[');
await page.keyboard.press('[');
await page.waitForURL(`${ORIGIN}/pager`, { timeout: 3000 }).catch(() => {});
check('[[ follows rel=prev', page.url() === `${ORIGIN}/pager`, page.url());
await page.mouse.click(990, 790);
await page.keyboard.press(']');
await page.keyboard.press('x');
await settle();
check('] then another key does nothing and both keys reach the page', page.url() === `${ORIGIN}/pager` &&
  JSON.stringify(await evalPage(() => window.pageKeys)) === '["]","x"]', JSON.stringify(await evalPage(() => window.pageKeys)));

// ===== ? key sheet =====
await load('/nav');
await page.keyboard.press('?');
await settle();
const sheet = ((await overlayNodes()).find((n) => n.kind === 'help') || {}).text || '';
check('? shows the key sheet', /Single keys/.test(sheet) && /next \/ previous page/.test(sheet), sheet.slice(0, 120));
await page.keyboard.press('Escape');
await settle();
check('Esc closes it', !(await overlayNodes()).some((n) => n.kind === 'help'));
await page.keyboard.press('?');
await page.keyboard.press('?');
await settle();
check('? ? closes it and the second ? reaches the site', !(await overlayNodes()).some((n) => n.kind === 'help') &&
  JSON.stringify(await evalPage(() => window.pageKeys)) === '["?"]', JSON.stringify(await evalPage(() => window.pageKeys)));

// ===== ` goes back to the tab used before =====
const activeTabUrl = () => sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].url);
const activateUrl = (url) => sw.evaluate(async (u) => { const [t] = await chrome.tabs.query({ url: u }); await chrome.tabs.update(t.id, { active: true }); }, url);
const second = await context.newPage();
await second.goto(`${ORIGIN}/tabtwo`);
await load('/nav');
await activateUrl(`${ORIGIN}/tabtwo`);
await activateUrl(`${ORIGIN}/nav`);
await page.keyboard.press('`');
await page.waitForTimeout(300);
check('` switches to the tab used before', (await activeTabUrl()) === `${ORIGIN}/tabtwo`, await activeTabUrl());
await second.mouse.click(5, 5);
await second.keyboard.press('`');
await page.waitForTimeout(300);
check('` again comes back', (await activeTabUrl()) === `${ORIGIN}/nav`, await activeTabUrl());

// ===== palette: close duplicate / other tabs =====
const tabCount = () => sw.evaluate(async () => (await chrome.tabs.query({ lastFocusedWindow: true })).length);
const dupe = await context.newPage();
await dupe.goto(`${ORIGIN}/nav#home`);
await activateUrl(`${ORIGIN}/nav`);
const runPalette = async (text) => {
  await sendToTab('open-palette');
  await settle();
  await page.keyboard.type(text, { delay: 40 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
};
const beforeDupes = await tabCount();
await runPalette('close duplicate tabs');
check('palette closes the duplicate tab (same address, ignoring #) and keeps the others', (await tabCount()) === beforeDupes - 1 &&
  dupe.isClosed() && !second.isClosed(), `${beforeDupes} -> ${await tabCount()}`);
await runPalette('close other tabs');
check('palette closes every other tab', (await tabCount()) === 1 && second.isClosed(), `${await tabCount()}`);

// ===== post mode: counts, copy text, save as image =====
await load('/xfeed');
await sendToTab('item-mode');
await settle();
const chip = ((await overlayNodes()).find((n) => n.kind === 'chip') || {}).text || '';
check('post mode shows the post counts, views first', /^95\d views · 1\d likes · 2 bookmarks · 3 reposts · 1 reply$/.test(chip), chip);
await page.keyboard.press('y');
await settle();
check('y copies the post text', /^Hello post \d$/.test(await evalPage(() => navigator.clipboard.readText())), await evalPage(() => navigator.clipboard.readText()));
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.keyboard.press('s')]);
const png = readFileSync(await download.path());
const pngWidth = png.readUInt32BE(16), pngHeight = png.readUInt32BE(20);
const post = await evalPage(() => { const r = document.querySelector('article').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
check('s saves the post as a PNG the size of the post', png.subarray(1, 4).toString() === 'PNG' && /localhost-post-.*\.png$/.test(download.suggestedFilename()) &&
  Math.abs(pngWidth - post.w) <= 2 && Math.abs(pngHeight - post.h) <= 2, `${download.suggestedFilename()} ${pngWidth}x${pngHeight} vs ${post.w}x${post.h}`);
check('the ring is not in the saved picture (overlay back afterwards)', (await overlayNodes()).some((n) => n.kind === 'ring'));
await page.keyboard.press('Escape');

// ===== GitHub pull request files =====
await page.goto('https://github.com/o/r/pull/1/changes');
await page.waitForTimeout(200);
await page.mouse.click(990, 790);
const fileTop = (i) => evalPage((n) => Math.round(document.getElementById(`diff-${n}`).getBoundingClientRect().top), i);
await page.keyboard.press('Shift+J');
await settle();
check('github J goes to the next file (under the sticky headers)', (await fileTop(1)) === 120, await fileTop(1));
await page.keyboard.press('Shift+N');
await settle();
const threadTop = await evalPage(() => Math.round(document.querySelector('[data-testid=review-thread]').getBoundingClientRect().top));
check('github N goes to the next review thread', threadTop === 120, threadTop);
await page.keyboard.press('Shift+K');
await settle();
check('github K from inside a file goes to that file\'s top', (await fileTop(1)) === 120, await fileTop(1));
await page.keyboard.press('v');
await settle();
check('github v marks the file at the top viewed', (await evalPage(() => document.querySelector('#diff-1 button').getAttribute('aria-pressed'))) === 'true' &&
  /Viewed: b\.php/.test(await toastText()), await toastText());
await page.keyboard.press('j');
check("github's own j still reaches the page", (await evalPage(() => window.pageKeys)).includes('j'));

// ===== Jira =====
await page.goto('https://example.atlassian.net/browse/ABC-42');
await page.waitForTimeout(200);
await page.mouse.click(990, 790);
await page.keyboard.press('Shift+Y');
await settle();
check('jira Y copies the issue key', (await evalPage(() => navigator.clipboard.readText())) === 'ABC-42', await evalPage(() => navigator.clipboard.readText()));
await page.keyboard.press('i');
check("jira's own i still reaches the page", (await evalPage(() => window.pageKeys)).includes('i'));

check('no uncaught errors from the extension during the whole run', pageErrors.length === 0, pageErrors.join(' | '));

await context.close();
server.close();
httpsServer.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
