// Read-only experiment: how many hints would get a label from their own text ("Explore" -> e,
// "Score card" -> sc) if labels were initials first, generated letters as the fallback?
// Uses the extension's own target finder (content/targets.js); changes nothing.
// Usage: node test/mnemonic-coverage.mjs        (needs internet)
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = {
  wikipedia: 'https://en.wikipedia.org/wiki/Computer_keyboard',
  github: 'https://github.com/torvalds/linux',
  hackernews: 'https://news.ycombinator.com/',
  youtube: 'https://www.youtube.com/',
  mdn: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
  google: 'https://www.google.com/search?q=keyboard+shortcuts&hl=en',
};

// Runs in the page. Returns per-scenario counts and sample labels.
export const SCORE = `(() => {
  const isLearned = () => false;
  ${readFileSync(join(root, 'content/targets.js'), 'utf8')}
  const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'for', 'in', 'on', 'with', 'your', 'my']);
  const words = (t) => {
    const all = t.normalize('NFKD').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => /^[a-z]/.test(w));
    const content = all.filter((w) => !STOP.has(w));
    return content.length ? content : all;
  };
  // Mnemonic two-letter candidates, best first: initials of the first two words, then the first
  // letter with each later letter of the first word (exp -> "ex", "ep"...).
  const pairs = (ws) => {
    const out = [];
    if (ws[1]) out.push(ws[0][0] + ws[1][0]);
    for (const c of ws[0].slice(1)) if (/[a-z]/.test(c)) out.push(ws[0][0] + c);
    for (const w of ws.slice(2)) out.push(ws[0][0] + w[0]);
    return [...new Set(out)];
  };
  const targets = findClickables().map((t) => ({ text: t.text, ws: words(t.text) }));

  function assign(alphabet) {
    const ok = (l) => [...l].every((c) => alphabet.includes(c));
    const seenText = new Set();
    for (const t of targets) {
      const key = t.ws.join(' ');
      t.kind = !t.ws.length ? 'notext' : seenText.has(key) ? 'duplicate' : null;
      if (key) seenText.add(key);
      t.label = null;
    }
    const groups = {};
    for (const t of targets) if (!t.kind && ok(t.ws[0][0])) (groups[t.ws[0][0]] ||= []).push(t);
    const used = new Set(), singles = new Set();
    for (const [letter, g] of Object.entries(groups)) {
      if (g.length === 1) { g[0].label = letter; g[0].kind = 'single'; used.add(letter); singles.add(letter); continue; }
      for (const t of g) {
        const pick = pairs(t.ws).find((p) => ok(p) && !used.has(p));
        // Guessable: initials of two words, or the word's first two letters. Anything else is weak.
        const guessable = pick && (pick === (t.ws[1] && t.ws[0][0] + t.ws[1][0]) || pick === t.ws[0].slice(0, 2));
        if (pick) { t.label = pick; t.kind = guessable ? 'initials' : 'weak'; used.add(pick); }
      }
    }
    // Fallback: any free two-letter label that doesn't start with a single-letter label.
    const free = [];
    for (const a of alphabet) if (!singles.has(a)) for (const b of alphabet) if (!used.has(a + b)) free.push(a + b);
    for (const t of targets) if (!t.label) { t.label = free.shift() || '??'; t.kind ||= 'fallback'; }
    const count = (k) => targets.filter((t) => t.kind === k).length;
    return {
      total: targets.length, single: count('single'), initials: count('initials'), weak: count('weak'),
      fallback: count('fallback'), duplicate: count('duplicate'), notext: count('notext'),
      sample: targets.filter((t) => t.kind !== 'fallback' && t.kind !== 'duplicate' && t.kind !== 'notext').slice(0, 14).map((t) => t.label + '=' + t.text.slice(0, 22)),
      misses: targets.filter((t) => t.kind === 'fallback').slice(0, 6).map((t) => t.label + '=' + t.text.slice(0, 22)),
    };
  }
  return { all26: assign('abcdefghijklmnopqrstuvwxyz'), withModeKeys: assign('adefghijklnopqrstuwy') };
})()`;

export function report(name, r) {
  const pct = (n, of) => (of ? Math.round((100 * n) / of) : 0);
  for (const [scenario, s] of Object.entries(r)) {
    const withText = s.total - s.notext - s.duplicate;
    console.log(`${name.padEnd(11)} ${scenario.padEnd(13)} ${String(s.total).padStart(4)} hints | from their text: ` +
      `guessable ${s.single + s.initials} (${pct(s.single + s.initials, withText)}% of ${withText} with own text; ${s.single} one key), ` +
      `weak ${s.weak} | ` +
      `fallback ${s.fallback} | repeated text ${s.duplicate} | no text ${s.notext}`);
  }
  console.log(`            e.g. ${r.all26.sample.join(' · ')}`);
  console.log(`            fallback e.g. ${r.all26.misses.join(' · ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const [name, url] of Object.entries(SITES)) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2500);
      report(name, await page.evaluate(SCORE));
    } catch (err) {
      console.log(`${name}: ${err.message.split('\n')[0]}`);
    }
  }
  await browser.close();
}
