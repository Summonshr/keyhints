// The practice page opened when KeyHints is installed. Content scripts don't run on extension
// pages, so this page loads them itself, in manifest order, so f / Alt+J / Alt+K work right here.

(async () => {
  for (const src of chrome.runtime.getManifest().content_scripts[0].js) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`KeyHints welcome: couldn't load ${src}`));
      document.head.append(script);
    });
  }
})();

const $ = (id) => document.getElementById(id);

// Show the real shortcuts. Chromium leaves a command without a key when another extension
// already uses it, and on a Mac Alt is Option: say what the keys actually are here.
chrome.commands.getAll().then((commands) => {
  const key = (name) => commands.find((c) => c.name === name).shortcut;
  for (const [name, cls] of [['show-hints', 'hintkey'], ['open-palette', 'palettekey']]) {
    for (const el of document.querySelectorAll(`.${cls}`)) {
      el.querySelector('kbd').textContent = key(name) || 'no key set';
    }
  }
  const missing = commands.filter((c) => c.description && !c.shortcut);
  if (!missing.length) return;
  const warn = document.createElement('p');
  warn.className = 'warn';
  warn.textContent = `Another extension already uses the key for: ${missing.map((c) => c.description).join('; ')}. ` +
    'f still works. To pick your own keys: ';
  const fix = document.createElement('button');
  fix.textContent = 'Set shortcuts';
  fix.onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  warn.append(fix);
  $('shortcut').append(warn);
});

// KeyHints clicks with synthetic events (isTrusted false); a mouse or keyboard click is trusted.
$('pad1').addEventListener('click', (e) => {
  if (e.target.tagName !== 'BUTTON') return;
  $('done1').textContent = e.isTrusted
    ? 'That one was the mouse (or Tab). Try f, then a label.'
    : `✓ You clicked "${e.target.textContent}" without touching the mouse.`;
});

let homePicks = 0;
$('home').addEventListener('click', (e) => {
  if (e.isTrusted) return;
  homePicks += 1;
  $('done2').textContent = homePicks < 3
    ? `${homePicks} of 3…`
    : '✓ Home now has a key of its own (see the note at the bottom). Press f and it\'s one key away.';
});

const SEARCH = { permissions: ['bookmarks', 'history'] };
async function showGranted() {
  const ok = await chrome.permissions.contains(SEARCH);
  $('granted').textContent = ok ? '✓ The palette searches bookmarks and history' : '';
  $('grant').hidden = ok;
}
$('grant').onclick = () => chrome.permissions.request(SEARCH).then(showGranted);
showGranted();

chrome.storage.local.get('keycast').then((r) => { $('keycast').checked = !!r.keycast; });
$('keycast').onchange = (e) => chrome.storage.local.set({ keycast: e.target.checked });

$('settings').onclick = () => chrome.runtime.openOptionsPage();
