// The only writer of chrome.storage.local (see shared/storage.ts for what's in it). Changes to one
// storage key run one at a time, so two tabs picking at the same moment can't lose an update.
// Pins and settings are copied to chrome.storage.sync as they change (sync.ts brings others' back).

import { keepFitting, pin, remember, sanitize } from '../core/memory';
import { mergePinMaps, pinsOf, samePins, validPins, validTime, type PinMap } from '../core/sync';
import { hasOwnKeys, readSettings, siteDisabled, validateAlphabet, validateSettings, type Settings } from '../shared/settings';
import {
  LABELS_PREFIX, LEARNED_PREFIX, MAX_ID, MAX_LEARNED, MAX_NAME, MAX_SELECTOR, SCHEMA, labelsKey, learnedKey, undoKey,
  type Memory, type MemoryEntry, type Undo,
} from '../shared/storage';
import type { Backup } from '../shared/messages';

const local = chrome.storage.local;
const queues = new Map<string, Promise<unknown>>();

// Runs `fn` after every earlier change to `key` has finished.
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) || Promise.resolve()).then(fn, fn);
  queues.set(key, run.catch(() => {}));
  return run;
}

// ---------- labels ----------

async function readMemory(host: string): Promise<Memory> {
  const { [labelsKey(host)]: m } = await local.get(labelsKey(host));
  return sanitize(m as Memory | undefined);
}

export const pinsKey = (host: string) => `pins:${host}`;

// Sends this site's pin records to sync, merged with what's there (per element, newer wins).
async function pushPins(host: string, memory: Memory) {
  const mine = pinsOf(memory);
  const { [pinsKey(host)]: synced = {} } = await chrome.storage.sync.get(pinsKey(host));
  const merged = mergePinMaps(validPins(synced as PinMap, Date.now()), mine); // a malformed record in sync is dropped
  if (!samePins(merged, synced as PinMap)) await chrome.storage.sync.set({ [pinsKey(host)]: merged });
}

// Sends a site's pins as they are (when sync has none for it yet).
export const pushSitePins = (host: string) => serial(labelsKey(host), async () => pushPins(host, await readMemory(host)));

// Changes one site's labels. `fn` returns the new memory and an answer for the caller.
export function updateMemory<T>(host: string, fn: (m: Memory, settings: Settings) => { memory: Memory; answer: T; undo?: Undo | null }): Promise<T> {
  return serial(labelsKey(host), async () => {
    const [memory, settings] = await Promise.all([readMemory(host), readSettingsNow()]);
    const { memory: next, answer, undo } = fn(memory, settings);
    await local.set({ [labelsKey(host)]: next, ...(undo ? { [undoKey(host)]: undo } : {}) });
    if (!samePins(pinsOf(memory), pinsOf(next))) await pushPins(host, next);
    return answer;
  });
}

// What a page-side request may save: short strings only (a page chooses its element names).
function checkEntry(host: string, id: string, label: string, name: string) {
  const ok = typeof host === 'string' && host.length <= 255 && typeof id === 'string' && id.length <= MAX_ID &&
    typeof label === 'string' && /^[a-z0-9]{1,8}$/.test(label) && typeof name === 'string' && name.length <= MAX_NAME;
  if (!ok) throw new Error('that label is not in a form KeyHints saves');
}

export const rememberPick = async (host: string, id: string, label: string, name: string) => {
  checkEntry(host, id, label, name);
  return updateMemory(host, (m, s) => {
    const r = remember(m, id, label, name, s.alphabet, Date.now());
    return { memory: r.memory, answer: { promoted: r.promoted }, undo: r.undo };
  });
};

export const pinKey = async (host: string, id: string, key: string, name: string) => {
  checkEntry(host, id, key, name);
  return updateMemory(host, (m) => ({ memory: pin(m, id, key, name, Date.now()), answer: { ok: true as const } }));
};

export const forgetLabels = (host: string, ids: string[]) =>
  updateMemory(host, (m) => {
    const next = { ...m };
    for (const id of ids) if (!next[id]?.pinned) delete next[id];
    return { memory: next, answer: { ok: true as const } };
  });

// Takes back the last new single key: every label goes back to how it was just before.
export function undoPromotion(host: string) {
  return serial(labelsKey(host), async () => {
    const { [undoKey(host)]: undo } = await local.get(undoKey(host)) as { [k: string]: Undo | undefined };
    if (!undo) return { undone: null };
    await local.set({ [labelsKey(host)]: sanitize(undo.before) });
    await local.remove(undoKey(host));
    return { undone: { key: undo.key, name: undo.name } };
  });
}

// Forgetting a site's labels unpins its pins on every computer too.
export function forgetSite(host: string) {
  return serial(labelsKey(host), async () => {
    const memory = await readMemory(host);
    const now = Date.now();
    const tombstones: Memory = Object.fromEntries(Object.entries(memory).filter(([, e]) => e.pinned)
      .map(([id, e]) => [id, { ...e, pinned: false, pinAt: now }]));
    await local.remove([labelsKey(host), undoKey(host)]);
    if (Object.keys(tombstones).length) await pushPins(host, tombstones);
    return { ok: true as const };
  });
}

export async function forgetAll() {
  const all = await local.get(null);
  const hosts = Object.keys(all).filter((k) => k.startsWith(LABELS_PREFIX)).map((k) => k.slice(LABELS_PREFIX.length));
  for (const host of hosts) await forgetSite(host);
  return { ok: true as const };
}

// New hint letters: saved labels that used a removed letter are forgotten.
export async function setAlphabet(alphabet: string) {
  const error = validateAlphabet(alphabet);
  if (error) throw new Error(error);
  const all = await local.get(null);
  let dropped = 0;
  for (const key of Object.keys(all).filter((k) => k.startsWith(LABELS_PREFIX))) {
    const host = key.slice(LABELS_PREFIX.length);
    dropped += await updateMemory(host, (m) => {
      const r = keepFitting(m, alphabet);
      return { memory: r.memory, answer: r.dropped };
    });
  }
  await updateSettings((s) => ({ ...s, alphabet }));
  return { dropped };
}

// ---------- settings ----------

export async function readSettingsNow(): Promise<Settings> {
  const { settings } = await local.get('settings');
  return readSettings(settings as Partial<Settings> | undefined);
}

// Changes settings; `at` is when (another computer's time, when sync brings a change).
export function updateSettings(fn: (s: Settings) => Settings, at = Date.now(), push = true) {
  return serial('settings', async () => {
    const next = fn(await readSettingsNow());
    const error = validateSettings(next); // every way in: the settings page, an import, sync, a request
    if (error) throw new Error(error);
    await local.set({ settings: next, settingsAt: at });
    if (push) await chrome.storage.sync.set({ settings: { value: next, at } });
    return { ok: true as const };
  });
}

export function toggleSite(host: string) {
  let off = false;
  return updateSettings((s) => {
    let { disabledSites, enabledSites } = s;
    off = !siteDisabled(s, host);
    if (off) { // turning single keys off here
      if (enabledSites.includes(host)) enabledSites = enabledSites.filter((h) => h !== host); // back to the built-in default
      else disabledSites = [...disabledSites, host];
    } else {
      disabledSites = disabledSites.filter((h) => h !== host);
      if (hasOwnKeys(host)) enabledSites = [...enabledSites, host];
    }
    return { ...s, disabledSites, enabledSites };
  }).then(() => ({ off }));
}

// Gives `key` to this site, or takes it back. Returns whether the site keeps it now.
export function togglePassKey(host: string, key: string) {
  let keeps = false;
  return updateSettings((s) => {
    const passKeys = { ...s.passKeys };
    const keys = passKeys[host] || [];
    keeps = !keys.includes(key);
    passKeys[host] = keeps ? [...keys, key] : keys.filter((k) => k !== key);
    if (!passKeys[host].length) delete passKeys[host];
    return { ...s, passKeys };
  }).then(() => ({ keeps }));
}

// ---------- learned clicks, tips ----------

export async function learnAdd(host: string, selector: string) {
  if (typeof selector !== 'string' || selector.length > MAX_SELECTOR || typeof host !== 'string' || host.length > 255) {
    throw new Error('that selector is too long to learn');
  }
  return serial(learnedKey(host), async () => {
    const { [learnedKey(host)]: stored = [] } = await local.get(learnedKey(host)) as { [k: string]: string[] | undefined };
    if (stored.includes(selector)) return { added: false };
    await local.set({ [learnedKey(host)]: [...stored, selector].slice(-MAX_LEARNED) });
    return { added: true };
  });
}

export function learnForget(host: string) {
  return serial(learnedKey(host), async () => {
    const { [learnedKey(host)]: stored = [] } = await local.get(learnedKey(host)) as { [k: string]: string[] | undefined };
    await local.remove(learnedKey(host));
    return { count: stored.length };
  });
}

// Each tip shows once, ever: checked and marked in one step, so two tabs can't both show it.
export function tipOnce(id: string) {
  return serial('tipsSeen', async () => {
    const [{ tipsSeen = [] }, settings] = await Promise.all([local.get('tipsSeen') as Promise<{ tipsSeen?: string[] }>, readSettingsNow()]);
    if (!settings.tips || tipsSeen.includes(id)) return { show: false };
    await local.set({ tipsSeen: [...tipsSeen, id] });
    return { show: true };
  });
}

// "Show them again": every tip shows once more, and tips are on.
export function tipsReset() {
  return serial('tipsSeen', async () => {
    await local.set({ tipsSeen: [] });
    await updateSettings((s) => ({ ...s, tips: true }));
    return { ok: true as const };
  });
}

// ---------- import (keymaps and backups) ----------

// Throws a readable error when `data` isn't a KeyHints keymap or backup.
export function validateBackup(data: unknown): Backup {
  const d = data as Backup;
  if (!d || d.keyhints !== 2 || !d.labels || typeof d.labels !== 'object') throw new Error("That isn't a KeyHints keymap or backup (from this version).");
  const now = Date.now();
  const time = (v: unknown) => v === undefined || validTime(v, now); // nothing dated in the future
  const entryOk = (id: string, e: MemoryEntry) => id.length <= MAX_ID && !!e && typeof e.label === 'string' && /^[a-z0-9]{1,8}$/.test(e.label) &&
    typeof e.name === 'string' && e.name.length <= MAX_NAME && validTime(e.used, now) && time(e.pinAt) && time(e.since) &&
    (e.pinned === undefined || typeof e.pinned === 'boolean') && Number.isInteger(e.uses) && e.uses >= 0;
  for (const [key, entries] of Object.entries(d.labels)) {
    const ok = key.startsWith(LABELS_PREFIX) && key.length <= 300 && entries && typeof entries === 'object' &&
      Object.entries(entries).every(([id, e]) => entryOk(id, e));
    if (!ok) throw new Error(`The labels for "${key}" aren't in KeyHints' format.`);
  }
  for (const [key, selectors] of Object.entries(d.learned || {})) {
    const ok = key.startsWith(LEARNED_PREFIX) && Array.isArray(selectors) &&
      selectors.every((sel) => typeof sel === 'string' && sel.length <= MAX_SELECTOR);
    if (!ok) throw new Error(`The learned clicks for "${key}" aren't in KeyHints' format.`);
  }
  if (d.settings !== undefined) {
    const error = d.settings && typeof d.settings === 'object' ? validateSettings(readSettings(d.settings)) : 'The settings in it are invalid.';
    if (error) throw new Error(error);
  }
  return d;
}

// Your own entry for an element wins over the imported one; label clashes are settled by sanitize
// (pinned first, then the most recently used).
export async function importBackup(data: Backup) {
  const d = validateBackup(data);
  for (const [key, entries] of Object.entries(d.labels)) {
    const host = key.slice(LABELS_PREFIX.length);
    await updateMemory(host, (m) => ({ memory: sanitize({ ...entries, ...m }), answer: null }));
  }
  for (const [key, selectors] of Object.entries(d.learned || {})) {
    const host = key.slice(LEARNED_PREFIX.length);
    for (const sel of selectors) await learnAdd(host, sel); // the settings page checked they're valid CSS
  }
  if (d.settings) await updateSettings((s) => readSettings({ ...s, ...d.settings }));
  return { ok: true as const };
}

// ---------- schema ----------

// Data saved by another version of KeyHints is wiped (this is a development build: there is no
// one else's data to keep).
export async function checkSchema() {
  const [{ schema }, { schema: syncSchema }] = await Promise.all([local.get('schema'), chrome.storage.sync.get('schema')]);
  if (schema !== SCHEMA) {
    await local.clear();
    await local.set({ schema: SCHEMA });
  }
  if (syncSchema !== SCHEMA) {
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({ schema: SCHEMA });
  }
}
