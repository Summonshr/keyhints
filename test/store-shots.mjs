// Chrome Web Store screenshots (1280×800) and a demo video, headless. Output: ../store/
//   1-hints.png  2-learns.png  3-posts.png  4-video.png  5-welcome.png  demo.webm
// Ports 8785 / 8786, so it can run next to the other test scripts.
import { chromium } from 'playwright-core';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extPath = join(here, '..');
const out = join(extPath, 'store');
mkdirSync(out, { recursive: true });

const style = `<meta charset="utf-8"><style>
  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; color: #1f2328; background: #fff; }
  header { display: flex; gap: 22px; align-items: center; padding: 14px 32px; border-bottom: 1px solid #d0d7de; background: #f6f8fa; }
  header b { font-size: 18px; margin-right: 20px; } a { color: #0969da; text-decoration: none; }
  .wrap { display: grid; grid-template-columns: 230px 1fr; gap: 40px; padding: 28px 32px; }
  aside a { display: block; padding: 5px 0; } h1 { margin-top: 0; font-size: 30px; }
  button { font: inherit; padding: 7px 16px; border-radius: 6px; border: 1px solid #d0d7de; background: #f6f8fa; }
  input { font: inherit; padding: 7px 10px; width: 300px; border: 1px solid #d0d7de; border-radius: 6px; }
  body { padding-top: 70px; } .caption { position: fixed; left: 0; right: 0; top: 0; padding: 18px; text-align: center; font: 600 26px system-ui;
    background: #111827; color: #fff; letter-spacing: .01em; }
</style>`;

const docs = `${style}<header><b>Acme Docs</b><a href="/g">Guides</a><a href="/r">Reference</a><a href="/b">Blog</a>
  <a href="/c">Community</a><input placeholder="Search docs"></header>
  <div class="wrap"><aside>${['Getting started', 'Installation', 'Configuration', 'Routing', 'Data fetching', 'Caching',
    'Deploying', 'Testing', 'Upgrading', 'FAQ'].map((t) => `<a href="/${t}">${t}</a>`).join('')}</aside>
  <main><h1>Routing</h1><p>Every file in <a href="/pages">pages</a> becomes a route. Read about
  <a href="/dyn">dynamic segments</a>, <a href="/layouts">nested layouts</a> and <a href="/mw">middleware</a>
  before you <a href="/deploy">deploy</a>.</p><p><button>Copy example</button> <button>Open in playground</button></p>
  <p>Still stuck? Ask on the <a href="/forum">forum</a>, browse <a href="/examples">examples</a>, or
  <a href="/issue">open an issue</a>.</p></main></div>`;

const social = `${style}<div class="wrap" style="grid-template-columns:230px 600px"><aside style="font-size:19px">
  ${['Home', 'Explore', 'Notifications', 'Messages', 'Bookmarks', 'Profile'].map((t) => `<a href="#go-${t}" id="${t}">${t}</a>`).join('')}
  </aside><main>${Array.from({ length: 4 }, (_, i) => `<article style="border:1px solid #d0d7de;border-radius:10px;margin:0 0 14px;padding:14px;height:170px">
    <b>Dev ${i + 1}</b> <a href="/status/${i}"><time>${i + 1}h</time></a>
    <div data-testid="tweetText">${['Shipped the new release today 🎉', 'Hot take: keyboards are underrated.', 'Reading list for the weekend, thread ↓', 'Our team cut review time in half.'][i]}</div>
    <div role="group" aria-label="${3 + i} replies, ${12 + i} reposts, ${120 + i * 37} likes, ${8 + i} bookmarks, ${4 + i}.${i}K views" style="margin-top:14px;display:flex;gap:30px">
      <button aria-label="Reply">↩ ${3 + i}</button><button aria-label="Repost">⟳ ${12 + i}</button><button aria-label="Like">♥ ${120 + i * 37}</button></div>
  </article>`).join('')}</main></div>`;

const watch = `${style}<header><b>▶ VideoTube</b><input placeholder="Search"></header>
  <div style="padding:24px 32px"><video id="v" src="/media/clip.webm" preload="auto" muted style="display:block;width:960px;height:540px;background:#000"></video>
  <h2>How keyboards changed everything</h2></div>`;

const pages = { '/docs': docs, '/social': social };
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(pages[req.url] || ''); });
await new Promise((r) => server.listen(8785, '127.0.0.1', r));

// Fake https://www.youtube.com (video keys only run there), throwaway certificate.
const clip = readFileSync(join(here, 'media', 'clip.webm'));
const certDir = mkdtempSync(join(tmpdir(), 'keyhints-cert-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=test',
  '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')], { stdio: 'ignore' });
const httpsServer = createHttpsServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) }, (req, res) => {
  if (req.url.startsWith('/media/')) {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start = m ? Number(m[1]) : 0, end = m && m[2] ? Number(m[2]) : clip.length - 1;
    res.writeHead(m ? 206 : 200, { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': end - start + 1,
      ...(m ? { 'content-range': `bytes ${start}-${end}/${clip.length}` } : {}) });
    return res.end(clip.subarray(start, end + 1));
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(watch);
});
await new Promise((r) => httpsServer.listen(8786, '127.0.0.1', r));

const videoDir = mkdtempSync(join(tmpdir(), 'keyhints-video-'));
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'keyhints-')), {
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`,
    '--host-resolver-rules=MAP www.youtube.com:443 127.0.0.1:8786', '--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required'],
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
});
const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
await sw.evaluate(() => chrome.storage.local.set({ keycast: true, tipsOff: true })); // keys visible in the demo
// The install opens the welcome page in its own tab; close it so this tab is the active one.
for (let i = 0; i < 30; i++) {
  const welcome = context.pages().find((p) => p.url().endsWith('/welcome.html'));
  if (welcome) { await welcome.close(); break; }
  await new Promise((r) => setTimeout(r, 100));
}
const page = context.pages()[0] || await context.newPage();

const wait = (ms) => page.waitForTimeout(ms);
const press = async (keys, gap = 260) => { for (const k of keys) { await page.keyboard.press(k); await wait(gap); } };
const caption = (text) => page.evaluate((t) => {
  document.querySelector('.caption')?.remove();
  const div = Object.assign(document.createElement('div'), { className: 'caption', textContent: t });
  div.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:18px;text-align:center;font:600 26px system-ui;background:#111827;color:#fff';
  document.body.append(div);
}, text);
const shot = (name) => page.screenshot({ path: join(out, name) });
// The label KeyHints drew for an element: hints carry their target's top-left in data-at.
const cdp = await context.newCDPSession(page);
async function labelOf(selector) {
  const at = await page.locator(selector).first().evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const text = (n) => (n.nodeType === 3 ? n.nodeValue : (n.children || []).map(text).join(''));
  let label = null;
  (function walk(n) {
    const a = n.attributes || [];
    const i = a.indexOf('data-at');
    if (i >= 0) { const [x, y] = a[i + 1].split(',').map(Number); if (Math.abs(x - at[0]) <= 1 && Math.abs(y - at[1]) <= 1) label = text(n); }
    for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) walk(c);
  })(root);
  if (!label) throw new Error(`store-shots: no hint on ${selector} at ${at}: ${JSON.stringify(await page.evaluate(() => document.title + location.href))}`);
  return label;
}

// 1. Hints on a docs page.
await page.goto('http://localhost:8785/docs');
await caption('Every link and button gets a key');
await page.mouse.click(1270, 400);
await wait(600);
await press(['f'], 700);
await shot('1-hints.png');
await press([...await labelOf('a[href="/layouts"]')], 400);
await wait(600);

// 2. Learning: pick Home three times, the third pick earns it a single key.
await page.goto('http://localhost:8785/social');
await caption('It learns your favourite buttons');
await page.mouse.click(1270, 790);
for (let i = 0; i < 3; i++) {
  await press(['f'], 450);
  await press([...await labelOf('#Home')], 350);
}
await wait(250);
await shot('2-learns.png');
await wait(1200);

// 3. Post mode.
await caption('Go through your feed with j / k');
await sw.evaluate(async () => toPage((await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0], { type: 'item-mode' })); // Alt+I
await wait(500);
await press(['j'], 500);
await shot('3-posts.png');
await press(['j', 'k'], 500);
await press(['Escape'], 400);

// 4. Video keys.
await page.goto('https://www.youtube.com/watch');
await caption('Skip, seek and change speed on YouTube and Netflix');
await page.evaluate(() => document.getElementById('v').play());
await page.mouse.click(1270, 790);
await wait(800);
await press([']'], 150);
await shot('4-video.png');
await press(['>', '>'], 500);
await wait(800);

// 5. Welcome page.
await page.goto(`chrome-extension://${extId}/welcome.html`);
await wait(500);
await page.evaluate(() => { document.body.style.paddingTop = '70px'; });
await caption('No account. No tracking. Nothing leaves your browser.');
await wait(300);
await shot('5-welcome.png');

const video = page.video();
await context.close();
copyFileSync(await video.path(), join(out, "demo.webm"));
rmSync(videoDir, { recursive: true, force: true });
server.close();
httpsServer.close();
console.log(`Wrote ${out}/1-hints.png … 5-welcome.png and demo.webm`);
