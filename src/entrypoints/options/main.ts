// Settings page. Shows what's stored; every change is a request to the background script.

import { call, type Backup } from '../../shared/messages';
import { DEFAULT_ALPHABET, readSettings, SITES_WITH_OWN_KEYS, validateAlphabet, type Settings } from '../../shared/settings';
import { allowSearch, searchAllowed, stopSearch } from '../../shared/permissions';
import { LABELS_PREFIX, LEARNED_PREFIX, labelsKey, type Memory } from '../../shared/storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (text: string) => { $('status').textContent = text; };
const getSettings = async () => readSettings((await chrome.storage.local.get('settings')).settings as Partial<Settings> | undefined);
const patch = (p: Partial<Settings>) => call('settings-patch', { patch: p });

// Practice picks on the welcome page are saved under the extension's own id: not real use.
const WELCOME_KEY = labelsKey(chrome.runtime.id);

function button(text: string, onClick: () => unknown) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

async function render() {
  const settings = await getSettings();
  $<HTMLInputElement>('alphabet').value = settings.alphabet;
  $<HTMLSelectElement>('hint-size').value = settings.hintSize;
  $<HTMLSelectElement>('hint-colors').value = settings.hintColors;
  $<HTMLInputElement>('keycast').checked = settings.keycast;
  $<HTMLInputElement>('tips').checked = settings.tips;

  // One list: the built-in sites (off unless turned on), the sites you turned off, and keys left to sites.
  const builtinOn = (site: string) => settings.enabledSites.some((h) => h === site || h.endsWith(`.${site}`));
  const rows = [
    ...SITES_WITH_OWN_KEYS.map((site) => ({
      site, on: builtinOn(site), action: '', done: '',
      note: builtinOn(site) ? 'on (you turned them on)' : 'off: the site has its own keys',
      toggle: () => patch({
        enabledSites: builtinOn(site)
          ? settings.enabledSites.filter((h) => !(h === site || h.endsWith(`.${site}`)))
          : [...settings.enabledSites, site, `www.${site}`],
      }),
    })),
    ...settings.disabledSites.map((site) => ({
      site, on: false, note: 'off', action: '', done: '',
      toggle: () => patch({ disabledSites: settings.disabledSites.filter((s) => s !== site) }),
    })),
    ...Object.entries(settings.passKeys).map(([site, keys]) => ({
      site, on: false, note: `keeps ${keys.join(' ')} for itself`, action: `Give ${keys.join(' ')} back to KeyHints`,
      done: `KeyHints uses ${keys.join(' ')} on ${site} again.`,
      toggle: () => {
        const passKeys = { ...settings.passKeys };
        delete passKeys[site];
        return patch({ passKeys });
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
  const keys = Object.keys(all).filter((k) => k.startsWith(LABELS_PREFIX)).sort();
  $('memory').replaceChildren(...keys.map((key) => {
    const host = key.slice(LABELS_PREFIX.length);
    const entries = Object.values(all[key] as Memory).sort((a, b) => a.label.localeCompare(b.label));
    const div = document.createElement('div');
    div.className = 'site';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `${key === WELCOME_KEY ? 'welcome page (practice)' : host || '(local files)'}: ${entries.length} saved`;
    const ul = document.createElement('ul');
    for (const { label, name, uses, pinned } of entries) {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = label.toUpperCase();
      li.append(code, `${name} · picked ${uses}×${pinned ? ' · pinned' : ''}`);
      ul.append(li);
    }
    details.append(summary, ul);
    div.append(details, button(`Forget ${host}`, async () => {
      await call('forget-site', { host });
      status(`Forgot saved labels for ${host}.`);
      render();
    }), button('Copy keymap', async () => {
      const keymap: Backup = { keyhints: 2, labels: { [key]: all[key] as Memory } };
      await navigator.clipboard.writeText(JSON.stringify(keymap));
      status(`Copied the keymap for ${host}. Paste it into "Share and back up" in anyone's KeyHints settings.`);
    }));
    return div;
  }));
  if (!keys.length) $('memory').textContent = 'No saved labels yet.';
  renderStats(all);
}

// ---------- hint letters and style ----------

async function saveAlphabet() {
  const alphabet = $<HTMLInputElement>('alphabet').value.trim();
  const error = validateAlphabet(alphabet);
  if (error) return status(error);
  const { dropped } = await call('set-alphabet', { alphabet });
  status(dropped ? `Saved. ${dropped} saved label${dropped === 1 ? '' : 's'} used a removed letter and ${dropped === 1 ? 'was' : 'were'} forgotten.` : 'Saved.');
  render();
}
$('save-alphabet').addEventListener('click', saveAlphabet);
$('alphabet').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveAlphabet(); });
$('reset-alphabet').addEventListener('click', () => {
  $<HTMLInputElement>('alphabet').value = DEFAULT_ALPHABET;
  saveAlphabet();
});
$('hint-size').addEventListener('change', (e) => patch({ hintSize: (e.target as HTMLSelectElement).value as Settings['hintSize'] }));
$('hint-colors').addEventListener('change', (e) => patch({ hintColors: (e.target as HTMLSelectElement).value as Settings['hintColors'] }));

// ---------- sites ----------

// Takes a host name or a pasted address ("https://x.com/home" -> "x.com").
function hostOf(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  try {
    return new URL(t.includes('://') ? t : `https://${t}`).hostname;
  } catch {
    return null; // not an address: the caller says so
  }
}

async function addSite() {
  const site = hostOf($<HTMLInputElement>('new-site').value);
  if (!site) return status('Enter a site like www.example.com, or paste its address');
  const { disabledSites } = await getSettings();
  if (!disabledSites.includes(site)) await patch({ disabledSites: [...disabledSites, site] });
  $<HTMLInputElement>('new-site').value = '';
  status(`Single keys off on ${site}.`);
  render();
}
$('add-site').addEventListener('click', addSite);
$('new-site').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSite(); });

// Forgetting everything (pinned keys too, on every computer) takes a second click.
let confirmForget = false;
const resetForget = () => { confirmForget = false; $('forget-all').textContent = 'Forget all saved labels'; };
$('forget-all').addEventListener('click', async () => {
  const n = Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith(LABELS_PREFIX)).length;
  if (!n) return status('No saved labels to forget.');
  if (!confirmForget) {
    confirmForget = true;
    $('forget-all').textContent = `Click again to forget saved labels on ${n} site${n === 1 ? '' : 's'}, pinned keys too`;
    return;
  }
  resetForget();
  await call('forget-all', {});
  status('Forgot all saved labels.');
  render();
});
$('forget-all').addEventListener('blur', resetForget);

// ---------- shortcuts ----------

// The shortcuts as the browser has them (another extension may have taken one, leaving it unset).
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
    what.textContent = description!;
    tr.append(key, what);
    return tr;
  }));
}
$('change-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

// ---------- your keys so far (derived from the saved labels; nothing else is counted) ----------

function keyStats(all: Record<string, unknown>) {
  const sites = Object.keys(all).filter((k) => k.startsWith(LABELS_PREFIX) && k !== WELCOME_KEY).map((key) => {
    const entries = Object.values(all[key] as Memory);
    return { host: key.slice(LABELS_PREFIX.length) || 'local files', picks: entries.reduce((n, e) => n + e.uses, 0),
      singles: entries.filter((e) => e.label.length === 1).length };
  });
  return {
    picks: sites.reduce((n, s) => n + s.picks, 0),
    singles: sites.reduce((n, s) => n + s.singles, 0),
    sites: sites.length,
    top: sites.sort((a, b) => b.picks - a.picks)[0],
  };
}

const statsLines = (st: ReturnType<typeof keyStats>) => [
  `${st.picks.toLocaleString()} clicks without the mouse`,
  `${st.singles} button${st.singles === 1 ? '' : 's'} with a key of their own, on ${st.sites} site${st.sites === 1 ? '' : 's'}`,
  `Most used on ${st.top.host}`,
];

function renderStats(all: Record<string, unknown>) {
  const st = keyStats(all);
  $('stats').textContent = st.picks ? statsLines(st).join(' · ') : 'No picks yet.';
  $('stats-image').hidden = !st.picks;
}

function download(name: string, blob: Blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('stats-image').addEventListener('click', async () => {
  const [big, ...rest] = statsLines(keyStats(await chrome.storage.local.get(null)));
  const canvas = Object.assign(document.createElement('canvas'), { width: 1200, height: 630 });
  const g = canvas.getContext('2d')!;
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
  canvas.toBlob((blob) => download('keyhints-keys.png', blob!));
});

// ---------- share and back up ----------

$('export').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const pick = (prefix: string) => Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(prefix) && k !== WELCOME_KEY));
  const backup: Backup = { keyhints: 2, labels: pick(LABELS_PREFIX) as Backup['labels'], learned: pick(LEARNED_PREFIX) as Backup['learned'], settings: await getSettings() };
  download('keyhints-backup.json', new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  status('Backup downloaded.');
});

const isSelector = (sel: string) => {
  try {
    document.createDocumentFragment().querySelector(sel);
    return true;
  } catch {
    return false; // not valid CSS: it would break hints on that site
  }
};

async function importText(text: string) {
  let data: Backup;
  try {
    data = JSON.parse(text);
    for (const [key, selectors] of Object.entries(data.learned || {})) {
      if (!selectors.every(isSelector)) throw new Error(`The learned clicks for "${key}" aren't valid CSS.`);
    }
    await call('import', { data }); // checks the rest of the format
  } catch (err) {
    return status(`Nothing imported: ${(err as Error).message.replace(/^KeyHints: import failed: /, '')}`);
  }
  status(`Added labels for ${Object.keys(data.labels).map((k) => k.slice(LABELS_PREFIX.length)).join(', ')}.${data.settings ? ' Settings restored.' : ''}`);
  $<HTMLTextAreaElement>('import-text').value = '';
  render();
}
$('import').addEventListener('click', () => importText($<HTMLTextAreaElement>('import-text').value));
$('import-pick').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await importText(await file.text());
  input.value = '';
});

// ---------- palette search (optional permissions) ----------

async function renderSearch() {
  const allowed = await searchAllowed();
  $('search-state').textContent = allowed ? 'Bookmarks and history: searched.' : 'Bookmarks and history: not searched.';
  $('search-toggle').textContent = allowed ? 'Stop searching them' : 'Allow';
  $('search-toggle').onclick = async () => {
    await (allowed ? stopSearch() : allowSearch());
    renderSearch();
  };
}

// ---------- show keys and tips ----------

$('keycast').addEventListener('change', (e) => patch({ keycast: (e.target as HTMLInputElement).checked }));
$('tips').addEventListener('change', (e) => patch({ tips: (e.target as HTMLInputElement).checked }));
$('tips-reset').addEventListener('click', async () => {
  await call('tips-reset', {});
  $<HTMLInputElement>('tips').checked = true;
  status('Tips will show again, once each.');
});

renderShortcuts();
renderSearch();
render();
