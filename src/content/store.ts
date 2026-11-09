// This site's settings, saved labels and learned click targets, as the content script sees them:
// read from storage and kept current. Never written here: changes are requests to the background
// script (shared/messages.ts), which writes storage; the change comes back through onChanged.

import { readSettings, siteDisabled as disabled, type Settings } from '../shared/settings';
import { labelsKey, learnedKey, type Memory } from '../shared/storage';
import { setOverlayStyle } from '../dom/overlay';

export const host = location.hostname;
export let settings: Settings = readSettings(undefined);
export let memory: Memory = {};
let learnedSelector = ''; // selectors learned from mouse clicks here, joined
export let learned: string[] = [];

const listeners: (() => void)[] = [];
export const onSettingsChanged = (fn: () => void) => listeners.push(fn);

function setSettings(s: Partial<Settings> | undefined) {
  settings = readSettings(s);
  setOverlayStyle({ hintSize: settings.hintSize, hintColors: settings.hintColors });
  for (const fn of listeners) fn();
}

function setLearned(list: string[] | undefined) {
  learned = list || [];
  learnedSelector = learned.join(',');
}

export const ready: Promise<void> = chrome.storage.local.get(['settings', labelsKey(host), learnedKey(host)]).then((r) => {
  setSettings(r.settings as Partial<Settings> | undefined);
  memory = (r[labelsKey(host)] as Memory | undefined) || {};
  setLearned(r[learnedKey(host)] as string[] | undefined);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) setSettings(changes.settings.newValue as Partial<Settings> | undefined);
  if (changes[labelsKey(host)]) memory = (changes[labelsKey(host)].newValue as Memory | undefined) || {};
  if (changes[learnedKey(host)]) setLearned(changes[learnedKey(host)].newValue as string[] | undefined);
});

export const siteDisabled = () => disabled(settings, host);
// Keys this site keeps for itself (YouTube's f for fullscreen) while every other KeyHints key works.
export const sitePassKeys = () => settings.passKeys[host] || [];
export const isLearned = (el: Element) => learnedSelector !== '' && el.matches(learnedSelector);
