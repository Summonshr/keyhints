// Screenshots of hints on differently themed pages, for eyeballing the look. Output: /tmp/keyhints-*.png
import { chromium } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const extPath = join(dirname(fileURLToPath(import.meta.url)), '..');

const body = `<meta charset="utf-8">
  <h1>Example site</h1>
  <p>Read the <a href="/a">documentation</a>, browse <a href="/b">examples</a> or <a href="/c">get help</a>.</p>
  <p><input placeholder="Search…" style="padding:6px;width:240px"> <button style="padding:6px 12px">Search</button></p>
  <p><textarea rows="3" cols="40" placeholder="Comment"></textarea></p>
  <nav><a href="/1">Home</a> · <a href="/2">Blog</a> · <a href="/3">About</a> · <a href="/4">Contact</a></nav>`;

const pages = {
  light: `<meta name="theme-color" content="#2563eb"><body style="font:16px system-ui;margin:24px;background:#fff;color:#222">${body}`,
  dark: `<meta name="theme-color" content="#a855f7"><body style="font:16px system-ui;margin:24px;background:#0f0f14;color:#ddd"><style>a{color:#c4b5fd}</style>${body}`,
  'links-only': `<body style="font:16px system-ui;margin:24px;background:#fdf6e3;color:#333"><style>a{color:#16a34a}</style>${body}`,
  plain: `<body style="font:16px system-ui;margin:24px;background:#fff;color:#222"><style>a{color:#333}</style>${body}`,
};

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(pages[req.url.slice(1)] || '');
});
await new Promise((r) => server.listen(8765, '127.0.0.1', r));

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'keyhints-')), {
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  viewport: { width: 640, height: 360 },
});
const page = context.pages()[0] || await context.newPage();
for (const name of Object.keys(pages)) {
  await page.goto(`http://localhost:8765/${name}`);
  await page.mouse.click(600, 340);
  await page.keyboard.press('f');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `/tmp/keyhints-${name}.png` });
  console.log(`/tmp/keyhints-${name}.png`);
}
await context.close();
server.close();
