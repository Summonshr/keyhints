// The practice page opened when KeyHints is installed. Content scripts don't run on extension
// pages, so this page runs KeyHints' content script itself: f / Alt+J / Alt+K work right here.

import { startContent } from '../../content/app';
import { allowSearch, searchAllowed } from '../../shared/permissions';
import { call } from '../../shared/messages';

startContent({ isInvalid: false, onInvalidated() {} });

const $ = (id: string) => document.getElementById(id)!;

// Show the real shortcuts. The browser leaves a command without a key when another extension
// already uses it, and on a Mac Alt is Option: say what the keys actually are here.
chrome.commands.getAll().then((commands) => {
  const key = (name: string) => commands.find((c) => c.name === name)?.shortcut;
  for (const [name, cls] of [['show-hints', 'hintkey'], ['open-palette', 'palettekey']]) {
    for (const el of document.querySelectorAll(`.${cls}`)) el.querySelector('kbd')!.textContent = key(name) || 'no key set';
  }
  const missing = commands.filter((c) => c.description && !c.shortcut);
  if (!missing.length) return;
  const warn = document.createElement('p');
  warn.className = 'warn';
  warn.textContent = `Another extension already uses the key for: ${missing.map((c) => c.description).join('; ')}. f still works. To pick your own keys: `;
  const fix = document.createElement('button');
  fix.textContent = 'Set shortcuts';
  fix.onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  warn.append(fix);
  $('shortcut').append(warn);
});

// KeyHints clicks with synthetic events (isTrusted false); a mouse or keyboard click is trusted.
$('pad1').addEventListener('click', (e) => {
  const b = e.target as HTMLElement;
  if (b.tagName !== 'BUTTON') return;
  $('done1').textContent = e.isTrusted
    ? 'That one was the mouse (or Tab). Try f, then a label.'
    : `✓ You clicked "${b.textContent}" without touching the mouse.`;
});

let homePicks = 0;
$('home').addEventListener('click', (e) => {
  if (e.isTrusted) return;
  homePicks += 1;
  $('done2').textContent = homePicks < 3 ? `${homePicks} of 3…` : '✓ Home keeps its key on this page from now on. Press ? to see your keys.';
});

async function showGranted() {
  const ok = await searchAllowed();
  $('granted').textContent = ok ? '✓ The palette searches bookmarks and history' : '';
  $('grant').hidden = ok;
}
$('grant').onclick = () => allowSearch().then(showGranted);
showGranted();

chrome.storage.local.get('settings').then((r) => {
  ($('keycast') as HTMLInputElement).checked = !!(r.settings as { keycast?: boolean } | undefined)?.keycast;
});
$('keycast').onchange = (e) => call('settings-patch', { patch: { keycast: (e.target as HTMLInputElement).checked } });
$('settings').onclick = () => chrome.runtime.openOptionsPage();
