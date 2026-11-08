const DEFAULT_ALPHABET = 'asdfghjkl' + 'qwertyuiop';
const MODE_KEYS = 'cbmvxz'; // keep in sync with MODES in content/main.js: they switch modes, so they can't be label letters
// Keep in sync with content/store.js: sites whose own single keys win unless turned back on.
const SITES_WITH_OWN_KEYS = ['youtube.com', 'netflix.com', 'mail.google.com', 'docs.google.com', 'figma.com'];

const $ = (id) => document.getElementById(id);
const status = (text) => { $('status').textContent = text; };

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { alphabet: DEFAULT_ALPHABET, disabledSites: [], enabledSites: [], passKeys: {}, ...settings };
}

async function saveSettings(patch) {
  await chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
}

function validateAlphabet(a) {
  if (!/^[a-z]+$/.test(a)) return 'Use lowercase letters a–z only.';
  if (new Set(a).size !== a.length) return 'Each letter may appear only once.';
  if (a.length < 4) return 'Use at least 4 letters.';
  const bad = [...a].filter((c) => MODE_KEYS.includes(c));
  if (bad.length) return `These letters switch modes and can't be used: ${bad.join(' ')}`;
  return null;
}

async function forgetLabels(keys) {
  await chrome.storage.local.remove(keys);
}

async function memoryKeys() {
  return Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('labels:'));
}

// Signature parts: tag|role|testid|aria|id|name|placeholder|type|href|text
function describe(sig) {
  const [tag, role, testid, aria, id, name, placeholder, type, href, text] = sig.split('|');
  const what = text || aria || placeholder || name || href || testid || id || role || type;
  return `${what || '(unnamed)'} · ${tag.toLowerCase()}`;
}

function button(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

async function render() {
  const settings = await getSettings();
  $('alphabet').value = settings.alphabet;

  // One list: the built-in sites (off unless turned on) and the sites you turned off.
  const builtinOn = (site) => settings.enabledSites.some((h) => h === site || h.endsWith(`.${site}`));
  const rows = [
    ...SITES_WITH_OWN_KEYS.map((site) => ({
      site, on: builtinOn(site),
      note: builtinOn(site) ? 'on (you turned them on)' : 'off: the site has its own keys',
      toggle: () => saveSettings({
        enabledSites: builtinOn(site)
          ? settings.enabledSites.filter((h) => !(h === site || h.endsWith(`.${site}`)))
          : [...settings.enabledSites, site, `www.${site}`],
      }),
    })),
    ...settings.disabledSites.map((site) => ({
      site, on: false, note: 'off',
      toggle: () => saveSettings({ disabledSites: settings.disabledSites.filter((s) => s !== site) }),
    })),
    // Keys a site keeps for itself (palette: "Leave a key to this site"); every other key still works there.
    ...Object.entries(settings.passKeys).map(([site, keys]) => ({
      site, note: `keeps ${keys.join(' ')} for itself`, action: `Give ${keys.join(' ')} back to KeyHints`,
      done: `KeyHints uses ${keys.join(' ')} on ${site} again.`,
      toggle: () => {
        const passKeys = { ...settings.passKeys };
        delete passKeys[site];
        return saveSettings({ passKeys });
      },
    })),
  ];
  $('sites').replaceChildren(...rows.map(({ site, on, note, toggle, action, done }) => {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = site;
    li.append(code, note, button(action || (on ? `Turn off on ${site}` : `Turn on for ${site}`), async () => {
      await toggle();
      status(done || (on ? `Single keys off on ${site}.` : `Single keys on for ${site}.`));
      render();
    }));
    return li;
  }));

  const all = await chrome.storage.local.get(null);
  const sites = Object.keys(all).filter((k) => k.startsWith('labels:')).sort();
  $('memory').replaceChildren(...sites.map((key) => {
    const entries = Object.entries(all[key]).sort((a, b) => a[1].label.localeCompare(b[1].label));
    const div = document.createElement('div');
    div.className = 'site';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `${key === WELCOME_KEY ? 'welcome page (practice)' : key.slice('labels:'.length) || '(local files)'}: ${entries.length} saved`;
    const ul = document.createElement('ul');
    for (const [sig, { label, uses = 1, pinned }] of entries) {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = label.toUpperCase();
      li.append(code, `${describe(sig)} · picked ${uses}×${pinned ? ' · pinned' : ''}`);
      ul.append(li);
    }
    details.append(summary, ul);
    div.append(details, button(`Forget ${key.slice('labels:'.length)}`, async () => {
      await forgetLabels([key]);
      status(`Forgot saved labels for ${key.slice('labels:'.length)}.`);
      render();
    }), button('Copy keymap', async () => {
      await navigator.clipboard.writeText(JSON.stringify({ keyhints: 1, labels: { [key]: all[key] } }));
      status(`Copied the keymap for ${key.slice('labels:'.length)}. Paste it into "Share and back up" in anyone's KeyHints settings.`);
    }));
    return div;
  }));
  if (!sites.length) $('memory').textContent = 'No saved labels yet.';
  renderStats(all);
}

// Saved labels that use a letter no longer in the alphabet are forgotten; the rest still work.
// Single-key labels may be any letter (the first letter of the element's name), so they stay.
async function keepFittingLabels(alphabet) {
  const all = await chrome.storage.local.get(await memoryKeys());
  let forgot = 0;
  const kept = {};
  for (const [key, entries] of Object.entries(all)) {
    kept[key] = Object.fromEntries(Object.entries(entries).filter(([, { label }]) => {
      const fits = label.length === 1 || [...label].every((c) => alphabet.includes(c));
      if (!fits) forgot++;
      return fits;
    }));
  }
  await chrome.storage.local.set(kept);
  return forgot;
}

async function saveAlphabet() {
  const alphabet = $('alphabet').value.trim();
  const error = validateAlphabet(alphabet);
  if (error) return status(error);
  const forgot = await keepFittingLabels(alphabet);
  await saveSettings({ alphabet });
  status(forgot ? `Saved. ${forgot} saved label${forgot === 1 ? '' : 's'} used a removed letter and ${forgot === 1 ? 'was' : 'were'} forgotten.` : 'Saved.');
  render();
}
$('save-alphabet').addEventListener('click', saveAlphabet);
$('alphabet').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveAlphabet(); });

$('reset-alphabet').addEventListener('click', () => {
  $('alphabet').value = DEFAULT_ALPHABET;
  saveAlphabet();
});

// Takes a host name or a pasted address ("https://x.com/home" -> "x.com").
function hostOf(text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  try {
    return new URL(t.includes('://') ? t : `https://${t}`).hostname;
  } catch {
    return null;
  }
}

async function addSite() {
  const site = hostOf($('new-site').value);
  if (!site) return status('Enter a site like www.example.com, or paste its address');
  const { disabledSites } = await getSettings();
  if (!disabledSites.includes(site)) await saveSettings({ disabledSites: [...disabledSites, site] });
  $('new-site').value = '';
  status(`Single keys off on ${site}.`);
  render();
}
$('add-site').addEventListener('click', addSite);
$('new-site').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSite(); });

// Forgetting everything (pinned keys too) takes a second click.
let confirmForget = false;
$('forget-all').addEventListener('click', async () => {
  const keys = await memoryKeys();
  if (!keys.length) return status('No saved labels to forget.');
  if (!confirmForget) {
    confirmForget = true;
    $('forget-all').textContent = `Click again to forget saved labels on ${keys.length} site${keys.length === 1 ? '' : 's'}, pinned keys too`;
    return;
  }
  confirmForget = false;
  $('forget-all').textContent = 'Forget all saved labels';
  await forgetLabels(keys);
  status('Forgot all saved labels.');
  render();
});
$('forget-all').addEventListener('blur', () => {
  confirmForget = false;
  $('forget-all').textContent = 'Forget all saved labels';
});

// The shortcuts as Chromium has them (another extension may have taken one, leaving it unset).
async function renderShortcuts() {
  const commands = (await chrome.commands.getAll()).filter((c) => c.description);
  $('shortcuts').replaceChildren(...commands.map(({ shortcut, description }) => {
    const tr = document.createElement('tr');
    const key = document.createElement('td');
    if (shortcut) {
      const kbd = document.createElement('kbd');
      kbd.textContent = shortcut;
      key.append(kbd);
    } else {
      key.className = 'warn';
      key.textContent = 'not set';
    }
    const what = document.createElement('td');
    what.textContent = description;
    tr.append(key, what);
    return tr;
  }));
}
$('change-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
renderShortcuts();

// ---------- your keys so far (derived from the saved labels; nothing else is counted) ----------

// Practice picks on the welcome page are saved under the extension's own id: not real use.
const WELCOME_KEY = `labels:${chrome.runtime.id}`;

function keyStats(all) {
  const sites = Object.keys(all).filter((k) => k.startsWith('labels:') && k !== WELCOME_KEY).map((key) => {
    const entries = Object.values(all[key]);
    return { host: key.slice('labels:'.length) || 'local files', picks: entries.reduce((n, e) => n + (e.uses || 1), 0),
      singles: entries.filter((e) => e.label.length === 1).length };
  });
  return {
    picks: sites.reduce((n, s) => n + s.picks, 0),
    singles: sites.reduce((n, s) => n + s.singles, 0),
    sites: sites.length,
    top: sites.sort((a, b) => b.picks - a.picks)[0],
  };
}

function statsLines(st) {
  return [
    `${st.picks.toLocaleString()} clicks without the mouse`,
    `${st.singles} button${st.singles === 1 ? '' : 's'} with a key of their own, on ${st.sites} site${st.sites === 1 ? '' : 's'}`,
    `Most used on ${st.top.host}`,
  ];
}

function renderStats(all) {
  const st = keyStats(all);
  $('stats').textContent = st.picks ? statsLines(st).join(' · ') : 'No picks yet.';
  $('stats-image').hidden = !st.picks;
}

function download(name, blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('stats-image').addEventListener('click', async () => {
  const [big, ...rest] = statsLines(keyStats(await chrome.storage.local.get(null)));
  const canvas = Object.assign(document.createElement('canvas'), { width: 1200, height: 630 });
  const g = canvas.getContext('2d');
  g.fillStyle = '#111827';
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = '#e0b400';
  g.font = '600 30px ui-monospace, monospace';
  g.fillText('KeyHints', 80, 110);
  g.fillStyle = '#ffffff';
  g.font = '700 64px system-ui, sans-serif';
  g.fillText(big, 80, 290);
  g.font = '36px system-ui, sans-serif';
  rest.forEach((line, i) => g.fillText(line, 80, 370 + i * 56));
  g.fillStyle = '#9ca3af';
  g.font = '26px system-ui, sans-serif';
  g.fillText('Click anything without a mouse', 80, 560);
  canvas.toBlob((blob) => download('keyhints-keys.png', blob));
});

// ---------- share and back up ----------

$('export').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const labels = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('labels:') && k !== WELCOME_KEY));
  const learned = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('learned:'))); // click targets (learn.js)
  const blob = new Blob([JSON.stringify({ keyhints: 1, labels, learned, settings: all.settings || {} }, null, 2)], { type: 'application/json' });
  download('keyhints-backup.json', blob);
  status('Backup downloaded.');
});

// A keymap or backup: { keyhints: 1, labels: { "labels:<host>": { <signature>: { label, used, uses, pinned } } },
//   learned?: { "learned:<host>": [<css selector>, …] }, settings? }
const isSelector = (sel) => {
  try {
    document.createDocumentFragment().querySelector(sel);
    return true;
  } catch {
    return false; // not valid CSS: it would break hints on that site
  }
};

function parseImport(text) {
  const data = JSON.parse(text);
  if (!data || data.keyhints !== 1 || typeof data.labels !== 'object') throw new Error('That isn\'t a KeyHints keymap or backup.');
  for (const [key, entries] of Object.entries(data.labels)) {
    const ok = key.startsWith('labels:') && entries && typeof entries === 'object' &&
      Object.values(entries).every((e) => e && /^[a-z]+$/.test(e.label) && Number.isFinite(e.used));
    if (!ok) throw new Error(`The labels for "${key}" aren't in KeyHints' format.`);
  }
  for (const [key, selectors] of Object.entries(data.learned || {})) {
    const ok = key.startsWith('learned:') && Array.isArray(selectors) &&
      selectors.every((sel) => typeof sel === 'string' && sel.length <= 200 && isSelector(sel));
    if (!ok) throw new Error(`The learned clicks for "${key}" aren't in KeyHints' format.`);
  }
  return data;
}

// Your own entry for an element wins over the imported one; label clashes are settled when a page
// loads them (pinned first, then the most recently used).
async function importText(text) {
  let data;
  try {
    data = parseImport(text);
  } catch (err) {
    return status(`Nothing imported: ${err.message}`);
  }
  const keys = Object.keys(data.labels);
  const current = await chrome.storage.local.get(keys);
  await chrome.storage.local.set(Object.fromEntries(keys.map((k) => [k, { ...data.labels[k], ...current[k] }])));
  const learnedKeys = Object.keys(data.learned || {});
  const currentLearned = await chrome.storage.local.get(learnedKeys);
  await chrome.storage.local.set(Object.fromEntries(learnedKeys.map((k) => [k, [...new Set([...(currentLearned[k] || []), ...data.learned[k]])].slice(-50)])));
  let note = '';
  if (data.settings) {
    const { alphabet, disabledSites, enabledSites, passKeys } = data.settings;
    const strings = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');
    const keyMap = (m) => m && typeof m === 'object' && Object.values(m).every((ks) => strings(ks) && ks.every((k) => k.length === 1));
    if (alphabet && validateAlphabet(alphabet)) note = ' Settings skipped: the hint letters in the backup are invalid.';
    else {
      await saveSettings({ ...(alphabet && { alphabet }), ...(strings(disabledSites) && { disabledSites }), ...(strings(enabledSites) && { enabledSites }),
        ...(keyMap(passKeys) && { passKeys }) });
      note = ' Settings restored.';
    }
  }
  status(`Added labels for ${keys.map((k) => k.slice('labels:'.length)).join(', ')}.${note}`);
  $('import-text').value = '';
  render();
}
$('import').addEventListener('click', () => importText($('import-text').value));
$('import-pick').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const [file] = e.target.files;
  if (file) await importText(await file.text());
  e.target.value = '';
});

// ---------- palette search (optional permissions) ----------

const SEARCH = { permissions: ['bookmarks', 'history'] };
async function renderSearch() {
  const allowed = await chrome.permissions.contains(SEARCH);
  $('search-state').textContent = allowed ? 'Bookmarks and history: searched.' : 'Bookmarks and history: not searched.';
  $('search-toggle').textContent = allowed ? 'Stop searching them' : 'Allow';
  $('search-toggle').onclick = async () => {
    await (allowed ? chrome.permissions.remove(SEARCH) : chrome.permissions.request(SEARCH));
    renderSearch();
  };
}
renderSearch();

// ---------- Show keys and tips (their own storage keys, read by content/keycast.js and content/tips.js) ----------

chrome.storage.local.get(['keycast', 'tipsOff']).then((r) => {
  $('keycast').checked = !!r.keycast;
  $('tips').checked = !r.tipsOff;
});
$('keycast').addEventListener('change', (e) => chrome.storage.local.set({ keycast: e.target.checked }));
$('tips').addEventListener('change', (e) => chrome.storage.local.set({ tipsOff: !e.target.checked }));
$('tips-reset').addEventListener('click', async () => {
  await chrome.storage.local.set({ tipsSeen: [], tipsOff: false });
  $('tips').checked = true;
  status('Tips will show again, once each.');
});

render();
