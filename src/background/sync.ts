// Brings other computers' pins and settings in from chrome.storage.sync (store.ts sends ours out).
// Without browser sync, chrome.storage.sync stays on this computer and nothing arrives.

import { applyPins, validPins, validTime, type PinMap } from '../core/sync';
import { readSettings, validateSettings, type Settings } from '../shared/settings';
import { LABELS_PREFIX } from '../shared/storage';
import { pinsKey, pushSitePins, updateMemory, updateSettings } from './store';

const PINS_PREFIX = 'pins:';
type SyncedSettings = { value: Settings; at: number };

async function pullSettings(remote: SyncedSettings | undefined) {
  if (!remote) return;
  // Another computer's settings are taken only if they would pass on the settings page here.
  if (!validTime(remote.at, Date.now()) || validateSettings(readSettings(remote.value))) return;
  const { settingsAt = 0 } = await chrome.storage.local.get('settingsAt') as { settingsAt?: number };
  if (remote.at > settingsAt) await updateSettings(() => readSettings(remote.value), remote.at, false);
}

const pullPins = (host: string, remote: PinMap) =>
  updateMemory(host, (m) => ({ memory: applyPins(m, validPins(remote, Date.now())), answer: null }));

export function installSync() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key === 'settings') pullSettings(newValue as SyncedSettings | undefined);
      else if (key.startsWith(PINS_PREFIX) && newValue) pullPins(key.slice(PINS_PREFIX.length), newValue as PinMap);
    }
  });
}

// When the browser starts or KeyHints is installed or updated: take whatever is newer in sync, and
// send up this computer's pins and settings that sync doesn't have yet.
export async function reconcileSync() {
  const [synced, localAll] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get(null)]);
  const remote = synced.settings as SyncedSettings | undefined;
  const localAt = (localAll.settingsAt as number | undefined) || 0;
  if (remote && remote.at >= localAt) await pullSettings(remote);
  else if (localAll.settings) await updateSettings((s) => s, localAt || Date.now()); // ours is newer: send it
  for (const [key, value] of Object.entries(synced)) {
    if (key.startsWith(PINS_PREFIX)) await pullPins(key.slice(PINS_PREFIX.length), value as PinMap);
  }
  for (const key of Object.keys(localAll).filter((k) => k.startsWith(LABELS_PREFIX))) {
    const host = key.slice(LABELS_PREFIX.length);
    if (!synced[pinsKey(host)]) await pushSitePins(host);
  }
}
