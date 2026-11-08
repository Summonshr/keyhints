// Settings and per-site label memory (chrome.storage.local), plus label assignment.

const DEFAULT_ALPHABET = 'asdfghjkl' + 'qwertyuiop'; // home row first, then top row

// Sites whose own single-key shortcuts beat ours (f is fullscreen on YouTube and Netflix, forward in Gmail;
// Docs and Figma type through hidden frames, where a bare f would be swallowed). Bare keys are left
// to these sites unless turned back on with the toolbar button or in settings.
const SITES_WITH_OWN_KEYS = ['youtube.com', 'netflix.com', 'mail.google.com', 'docs.google.com', 'figma.com'];

let settings = null; // { alphabet, disabledSites, enabledSites }
let memory = null; // { [signature]: { label, used, uses, pinned } } for this site
const MEMORY_KEY = `labels:${location.hostname}`;
const UNDO_KEY = `undo:${location.hostname}`; // the last new single key on this site, so it can be taken back
const MAX_REMEMBERED = 300; // per site; least recently used are forgotten first
const PROMOTE_AFTER = 3; // picks before an element earns a single-key label

function readSettings(stored) {
  return {
    alphabet: (stored && stored.alphabet) || DEFAULT_ALPHABET,
    disabledSites: (stored && stored.disabledSites) || [],
    enabledSites: (stored && stored.enabledSites) || [], // built-in sites switched back on
    passKeys: (stored && stored.passKeys) || {}, // { [host]: ['f', …] } keys left to the site, KeyHints ignores them there
  };
}

// Keys this site keeps for itself (YouTube's f for fullscreen) while every other KeyHints key works.
const sitePassKeys = () => settings.passKeys[location.hostname] || [];

// Gives `key` to this site, or takes it back. Read-modify-write of the stored settings, so changes
// made meanwhile on the options page aren't lost. Returns true if the site now keeps the key.
async function togglePassKey(key) {
  const { settings: stored = {} } = await chrome.storage.local.get('settings');
  const passKeys = { ...(stored.passKeys || {}) };
  const host = location.hostname;
  const keys = passKeys[host] || [];
  const keeps = !keys.includes(key);
  passKeys[host] = keeps ? [...keys, key] : keys.filter((k) => k !== key);
  if (!passKeys[host].length) delete passKeys[host];
  await chrome.storage.local.set({ settings: { ...stored, passKeys } });
  return keeps;
}

const ready = chrome.storage.local.get(['settings', MEMORY_KEY]).then((r) => {
  settings = readSettings(r.settings);
  memory = sanitize(r[MEMORY_KEY]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) {
    settings = readSettings(changes.settings.newValue);
    onSettingsChanged(); // main.js
  }
  if (changes[MEMORY_KEY]) memory = sanitize(changes[MEMORY_KEY].newValue);
});

function hasOwnKeys(host) {
  return SITES_WITH_OWN_KEYS.some((d) => host === d || host.endsWith(`.${d}`));
}

function siteDisabled() {
  const host = location.hostname;
  return settings.disabledSites.includes(host) || (hasOwnKeys(host) && !settings.enabledSites.includes(host));
}

// Two tabs on one site can save at the same moment; keep the most recently used entry
// whenever two labels clash, so the stored set always stays prefix-free.
function sanitize(stored) {
  const kept = {};
  // Pinned first (your explicit choice wins any clash), then most recently used.
  const entries = Object.entries(stored || {}).sort((a, b) => (b[1].pinned ? 1 : 0) - (a[1].pinned ? 1 : 0) || b[1].used - a[1].used);
  for (const [sig, entry] of entries.slice(0, MAX_REMEMBERED)) {
    const clash = Object.values(kept).some((k) => k.label.startsWith(entry.label) || entry.label.startsWith(k.label));
    if (!clash) kept[sig] = entry;
  }
  return kept;
}

const usesOf = (entry) => entry.uses || 1; // entries saved before use counting had no count

// Records a pick. The first pick saves the label; later picks only count (another copy of an
// identical element may have been picked under a different label). Returns the new single key
// if this pick earned the element one, else null. `text` is the element's visible name.
function remember(sig, label, text) {
  const entry = memory[sig];
  if (entry) {
    entry.used = Date.now();
    entry.uses = usesOf(entry) + 1;
  } else {
    memory[sig] = { label, used: Date.now(), uses: 1 };
  }
  const before = structuredClone(memory);
  const promoted = promote(sig, text);
  memory = sanitize(memory);
  // Kept in storage, not in the page: the pick that earned the key often navigates away.
  if (promoted) chrome.storage.local.set({ [MEMORY_KEY]: memory, [UNDO_KEY]: { before, key: promoted, text: text || '' } });
  else chrome.storage.local.set({ [MEMORY_KEY]: memory });
  return promoted;
}

// Takes back the last new single key on this site: every saved label goes back to how it was
// just before (the element keeps its old label; labels it pushed out return). Returns what was
// undone ({ key, text }) or null if there is nothing to undo.
async function undoPromotion() {
  const { [UNDO_KEY]: undo } = await chrome.storage.local.get(UNDO_KEY);
  if (!undo) return null;
  memory = sanitize(undo.before);
  await chrome.storage.local.set({ [MEMORY_KEY]: memory });
  await chrome.storage.local.remove(UNDO_KEY);
  return { key: undo.key, text: undo.text };
}

// Learned keys on this site, for the "?" sheet: single keys and pinned keys, with a readable name
// taken from the element's signature (its text, else its aria-label, placeholder or link path).
function learnedKeys() {
  return Object.entries(memory)
    .filter(([, e]) => e.label.length === 1 || e.pinned)
    .map(([sig, e]) => {
      const [, , , aria, , , placeholder, , href, text] = sig.split('|');
      const name = text || aria || placeholder || href || '(unnamed)'; // signatures are lowercase
      return { key: e.label, name: name[0].toUpperCase() + name.slice(1), pinned: !!e.pinned, uses: usesOf(e) };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

// A single-key label can be any letter that isn't a hint-mode key (c, b, m…): the hint alphabet,
// plus letters outside it (n for Notifications), which no generated label ever starts with.
function singleKeyAllowed(key) {
  return /^[a-z]$/.test(key) && !MODE_BY_KEY[key]; // main.js
}

// First letters of the words in an element's name, in order: "Notifications" -> n, "Creator Studio" -> s.
function initials(text) {
  const words = (text || '').toLowerCase().match(/[a-z]+/g) || [];
  return [...new Set(words.map((w) => w[0]))].filter(singleKeyAllowed);
}

// Frequently picked elements get a single key, the first letter of their name when it can be had
// (H for Home, N for Notifications). A key can be had if no saved label starts with it, or if every
// saved label starting with it is a longer label picked less often; those are forgotten (they get
// new labels next time). A single key someone already learned is never taken by another element.
// An element that already has a single key that isn't its initial moves to its initial once it can
// have it. Without a usable initial, home-row keys are tried first, cheapest first.
function promote(sig, text) {
  const entry = memory[sig];
  if (entry.pinned || usesOf(entry) < PROMOTE_AFTER) return null;
  const wanted = initials(text);
  if (entry.label.length === 1 && (wanted.includes(entry.label) || !wanted.length)) return null;
  const takeable = (key) => {
    const owners = Object.keys(memory).filter((s) => s !== sig && memory[s].label.startsWith(key));
    if (owners.some((s) => memory[s].pinned || memory[s].label.length === 1 || usesOf(memory[s]) >= usesOf(entry))) return null;
    return { key, owners, cost: owners.reduce((sum, s) => sum + usesOf(memory[s]), 0) };
  };
  let best = wanted.map(takeable).find(Boolean) || null;
  if (!best && entry.label.length === 1) return null; // keep the single key it has
  if (!best) {
    for (const key of settings.alphabet) {
      const option = takeable(key);
      if (option && (!best || option.cost < best.cost)) best = option;
      if (best && best.cost === 0) break;
    }
  }
  if (!best) return null;
  for (const s of best.owners) delete memory[s];
  entry.label = best.key;
  return best.key;
}

// You chose `key` for this element: it keeps it for good. Saved labels in the way are forgotten.
function pin(sig, key) {
  for (const s of Object.keys(memory)) {
    if (s !== sig && (memory[s].label.startsWith(key) || key.startsWith(memory[s].label))) delete memory[s];
  }
  const entry = memory[sig];
  memory[sig] = { label: key, used: Date.now(), uses: entry ? usesOf(entry) : 1, pinned: true };
  memory = sanitize(memory);
  chrome.storage.local.set({ [MEMORY_KEY]: memory });
}

// Prefix-free labels: no label is the start of another, so a match fires instantly.
// `reserved` labels (remembered ones) are never handed out, and nothing returned is a
// prefix of, or prefixed by, a reserved label. Returns null if reserved labels block every slot.
function makeLabels(n, reserved) {
  const prefixes = new Set();
  for (const r of reserved) for (let i = 1; i < r.length; i++) prefixes.add(r.slice(0, i));
  const free = (l) => l !== '' && !reserved.has(l) && !prefixes.has(l);

  const labels = [''];
  let offset = 0, freeCount = 0;
  while (freeCount < n) {
    if (offset >= labels.length) return null;
    const prefix = labels[offset++];
    if (free(prefix)) freeCount--;
    if (reserved.has(prefix)) continue; // never extend a reserved label
    for (const c of settings.alphabet) {
      labels.push(prefix + c);
      if (free(prefix + c)) freeCount++;
    }
  }
  return labels.slice(offset).filter(free).slice(0, n);
}

// Shortest label length that fits n targets with no remembered labels in the way.
function neededLength(n) {
  let len = 1;
  while (settings.alphabet.length ** len < n) len++;
  return len;
}

// Generated ids (React ":r1a:", "radix-…", "mui-…", hashes) change between page loads.
function stableId(id) {
  if (!id || id.length > 40 || /\d/.test(id)) return '';
  if (/^(radix|mui|headlessui|react|ember|svelte|ng-|_)/i.test(id)) return '';
  return id;
}

// Buttons that rename themselves when pressed count as one button.
const TOGGLES = [
  [/\bunmute\b/gi, 'mute'], [/\bpause\b/gi, 'play'], [/\b(unlike|liked)\b/gi, 'like'],
  [/\b(unfollow|following)\b/gi, 'follow'], [/\bcollapse\b/gi, 'expand'], [/\bshow less\b/gi, 'show more'],
];

// A description of the element that survives reloads and layout changes.
// Digits are masked so "Show 35 posts" and "Show 12 posts" count as the same button.
function signature(el, text) {
  const norm = (s) => TOGGLES.reduce((acc, [re, word]) => acc.replace(re, word),
    (s || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\d+/g, '#').slice(0, 80));
  const attr = (name) => norm(el.getAttribute(name));
  let href = '';
  const raw = el.getAttribute('href');
  if (raw) {
    const url = new URL(raw, document.baseURI);
    href = norm((url.host === location.host ? '' : url.host) + url.pathname);
  }
  return [
    el.tagName, attr('role'), attr('data-testid'), attr('aria-label'), norm(stableId(el.id)),
    attr('name'), attr('placeholder'), attr('type'), href, norm(text),
  ].join('|');
}

// Remembered labels for elements seen before; fresh ones for the rest (and `extra` fresh labels
// for hints in child frames). When identical elements are on screen (every post's Like button),
// the remembered label goes to the copy nearest the centre of the screen. Remembered labels block
// their slots, and a single-key one blocks every label starting with that key. If that would push
// labels to three keys when two would do, the least used, then least recent, memories are
// forgotten until it fits.
function assignLabels(targets, { useMemory, extra = 0 }) {
  const sigs = targets.map((t) => (useMemory ? signature(t.el, t.text) : null));
  const centreDistance = ({ rect }) => Math.hypot(rect.left + rect.width / 2 - innerWidth / 2, rect.top + rect.height / 2 - innerHeight / 2);
  const owner = {}; // signature -> index of the copy that gets the remembered label
  const copies = {};
  sigs.forEach((s, i) => {
    if (s) copies[s] = (copies[s] || 0) + 1;
    if (s && (owner[s] === undefined || centreDistance(targets[i]) < centreDistance(targets[owner[s]]))) owner[s] = i;
  });
  const maxLength = Math.max(2, neededLength(targets.length + extra));

  let forgot = false;
  for (;;) {
    const labels = sigs.map((s, i) => (s && owner[s] === i && memory[s] ? memory[s].label : null));
    const need = labels.filter((l) => !l).length + extra;
    const fresh = makeLabels(need, new Set(Object.values(memory).map((e) => e.label)));
    // Throwaway hints (text selection) may go long instead of costing remembered labels, and
    // pinned labels are never forgotten: if only those are left, labels may go long too.
    const forgettable = Object.entries(memory).filter(([, e]) => !e.pinned);
    if (fresh && (!useMemory || !forgettable.length || fresh.every((l) => l.length <= maxLength))) {
      if (forgot) chrome.storage.local.set({ [MEMORY_KEY]: memory });
      // `unique`: the element can be found again by its signature if the page re-renders it.
      const local = labels.map((l, i) => ({ label: l || fresh.shift(), sig: sigs[i], unique: !!sigs[i] && copies[sigs[i]] === 1 }));
      return { local, extra: fresh };
    }
    if (!forgettable.length) throw new Error('KeyHints: pinned labels block every label'); // makeLabels returned null
    const [weakest] = forgettable.sort((a, b) => usesOf(a[1]) - usesOf(b[1]) || a[1].used - b[1].used)[0];
    delete memory[weakest];
    forgot = true;
  }
}
