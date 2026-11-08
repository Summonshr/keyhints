const DEFAULT_ALPHABET = 'asdfghjkl' + 'qwertyuiop';
const MODE_KEYS = 'cbmvxz'; // keep in sync with MODES in content/main.js: they switch modes, so they can't be label letters
// Keep in sync with content/store.js: sites whose own single keys win unless turned back on.
const SITES_WITH_OWN_KEYS = ['youtube.com', 'netflix.com', 'mail.google.com', 'docs.google.com', 'figma.com'];

const $ = (id) => document.getElementById(id);
const status = (text) => { $('status').textContent = text; };

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { alphabet: DEFAULT_ALPHABET, disabledSites: [], enabledSites: [], ...settings };
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
  ];
  $('sites').replaceChildren(...rows.map(({ site, on, note, toggle }) => {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = site;
    li.append(code, note, button(on ? `Turn off on ${site}` : `Turn on for ${site}`, async () => {
      await toggle();
      status(on ? `Single keys off on ${site}.` : `Single keys on for ${site}.`);
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
    summary.textContent = `${key.slice('labels:'.length) || '(local files)'}: ${entries.length} saved`;
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
    }));
    return div;
  }));
  if (!sites.length) $('memory').textContent = 'No saved labels yet.';
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

render();
