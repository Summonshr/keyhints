// Headless test of the welcome page, Show keys and one-time tips. Ports 8775 / 8776, so it can
// run next to run.mjs.
import { chromium } from 'playwright-core';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = join(dirname(fileURLToPath(import.meta.url)), '..');

const plain = `<!doctype html><body style="font:14px sans-serif"><a href="#a">Alpha</a> <a href="#b">Beta</a>
  <input id="field"></body>`;
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(plain); });
await new Promise((r) => server.listen(8775, '127.0.0.1', r));

// Fake https://www.youtube.com and https://x.com (both HTTPS-only): a throwaway certificate.
const certDir = mkdtempSync(join(tmpdir(), 'keyhints-cert-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=test',
  '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')], { stdio: 'ignore' });
const httpsServer = createHttpsServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) },
  (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(plain); });
await new Promise((r) => httpsServer.listen(8776, '127.0.0.1', r));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`);
  if (!ok) failures++;
}

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'keyhints-')), {
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`,
    '--host-resolver-rules=MAP www.youtube.com:443 127.0.0.1:8776, MAP x.com:443 127.0.0.1:8776', '--ignore-certificate-errors'],
  viewport: { width: 1000, height: 800 },
});
const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const page = context.pages()[0] || await context.newPage();
const cdp = await context.newCDPSession(page);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// The overlay lives in closed shadow roots; CDP can pierce them.
async function overlay(kind) {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const found = [];
  const text = (n) => (n.nodeType === 3 ? n.nodeValue : (n.children || []).map(text).join(''));
  (function walk(n) {
    const attrs = Object.fromEntries((n.attributes || []).reduce((acc, v, i, a) => (i % 2 ? acc : acc.concat([[v, a[i + 1]]])), []));
    if ((attrs.class || '').split(' ').includes(kind)) found.push({ text: text(n), at: attrs['data-at'] });
    for (const c of [...(n.children || []), ...(n.shadowRoots || [])]) walk(c);
  })(root);
  return found;
}
const settle = (ms = 150) => page.waitForTimeout(ms);
const press = async (keys) => { for (const k of keys) await page.keyboard.press(k); };
async function labelAt(selector) {
  const at = await page.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
  const hint = (await overlay('hint')).find((h) => { const [x, y] = h.at.split(',').map(Number); return Math.abs(x - at[0]) <= 1 && Math.abs(y - at[1]) <= 1; });
  return hint && hint.text;
}

// ===== welcome page =====
await page.goto(`chrome-extension://${extId}/welcome.html`);
await settle(400);
check('welcome shows the real hints shortcut', (await page.locator('.hintkey kbd').first().textContent()) === 'Alt+J',
  await page.locator('.hintkey kbd').first().textContent());
await page.mouse.click(990, 20);
await press(['f']);
await settle();
const exploreLabel = await labelAt('#pad1 button >> nth=0');
check('f shows hints on the welcome page', !!exploreLabel, JSON.stringify(await overlay('hint')));
await press([...exploreLabel]);
await settle();
check('picking a practice button says it was done without the mouse', /without touching the mouse/.test(await page.locator('#done1').textContent()),
  await page.locator('#done1').textContent());

for (let i = 0; i < 3; i++) {
  await press(['f']);
  await settle();
  await press([...(await labelAt('#home'))]);
  await settle(100);
}
check('three Home picks complete step 2', /^✓/.test(await page.locator('#done2').textContent()), await page.locator('#done2').textContent());
check('the learning toast shows on the welcome page', /now has its own key/.test((await overlay('toast')).map((t) => t.text).join()),
  JSON.stringify(await overlay('toast')));

await sw.evaluate(async () => toggleHints((await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]));
await settle();
check('Alt+J (browser command) shows hints on the welcome page', (await overlay('hint')).length > 0);
await press(['Escape']);

check('bookmarks/history are not granted on install', await page.locator('#grant').isVisible());
await page.locator('#keycast').check();
check('the Show keys box saves the setting', (await sw.evaluate(() => chrome.storage.local.get('keycast'))).keycast === true);

// ===== Show keys =====
await page.goto('http://localhost:8775/');
await settle(300);
await page.mouse.click(990, 790);
await press(['f']);
await settle();
check('Show keys shows a pressed key', (await overlay('keycast')).some((k) => k.text.includes('f')), JSON.stringify(await overlay('keycast')));
await press(['Escape']);
await page.waitForTimeout(1700);
check('Show keys clears after a pause', (await overlay('keycast')).length === 0);
await page.locator('#field').click();
await press(['s', 'e', 'c', 'r', 'e', 't']);
await settle();
check('Show keys never shows what is typed in a field', (await overlay('keycast')).length === 0, JSON.stringify(await overlay('keycast')));
await page.keyboard.press('Control+a');
await settle();
check('Show keys shows chords while typing', (await overlay('keycast')).some((k) => k.text === 'Ctrl+A'), JSON.stringify(await overlay('keycast')));
await sw.evaluate(() => chrome.storage.local.set({ keycast: false }));
await page.waitForTimeout(1700);
await page.mouse.click(990, 790);
await press(['f']);
await settle();
check('Show keys off shows nothing', (await overlay('keycast')).length === 0);
await press(['Escape']);

// ===== one-time tips =====
await page.goto('https://www.youtube.com/');
await settle(500);
check('own-keys tip on the first YouTube visit', /single keys alone/.test((await overlay('tip')).map((t) => t.text).join()), JSON.stringify(await overlay('tip')));
await page.goto('https://www.youtube.com/');
await settle(500);
check('own-keys tip is not shown again', (await overlay('tip')).length === 0);
await sw.evaluate(() => chrome.storage.local.set({ tipsOff: true }));
await page.goto('https://x.com/');
await settle(500);
check('tips off: no post-mode tip on X', (await overlay('tip')).length === 0);
await sw.evaluate(() => chrome.storage.local.set({ tipsOff: false }));
await page.goto('https://x.com/');
await settle(500);
check('post-mode tip on X', /post mode/.test((await overlay('tip')).map((t) => t.text).join()), JSON.stringify(await overlay('tip')));

check('no uncaught errors', pageErrors.length === 0, pageErrors.join(' | '));
await context.close();
server.close();
httpsServer.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
