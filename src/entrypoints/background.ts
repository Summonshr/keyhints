// Background script: browser shortcuts, the toolbar button, and every request from pages
// (shared/messages.ts). It is the only writer of saved data (background/store.ts).

import type { Api, ApiType, PageMessage } from '../shared/messages';
import * as store from '../background/store';
import { installSync, reconcileSync } from '../background/sync';
import * as tabs from '../background/tabs';

// Sends a shortcut or toolbar action to the page. Tabs KeyHints can't run in (chrome://, the Web
// Store) say so on the toolbar button instead of doing nothing.
async function toPage(tab: chrome.tabs.Tab, msg: PageMessage) {
  try {
    await chrome.tabs.sendMessage(tab.id!, msg, { frameId: 0 });
  } catch (err) {
    if (!/Receiving end does not exist/.test((err as Error).message)) throw err;
    chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    chrome.action.setTitle({ tabId: tab.id, title: "KeyHints: browser pages like this one can't be used" });
  }
}

const CONTENT_SCRIPT = 'content-scripts/content.js';
const injectable = (url?: string) => /^(https?|file):/.test(url || '');

// Tabs opened before KeyHints was installed or updated get the new content script right away (the
// old one, if any, notices it was replaced and stops: content/lifecycle.ts).
async function injectIntoOpenTabs() {
  for (const tab of await chrome.tabs.query({})) {
    if (!injectable(tab.url) || tab.discarded) continue;
    await chrome.scripting.executeScript({ target: { tabId: tab.id!, allFrames: true }, files: [CONTENT_SCRIPT] })
      .catch((err) => console.warn(`KeyHints: couldn't add hints to ${tab.url}: ${err.message}`));
  }
}

type Handler<K extends ApiType> = (args: Api[K][0], sender: chrome.runtime.MessageSender) => Promise<Api[K][1]>;
const ok = { ok: true as const };
const tabOf = (sender: chrome.runtime.MessageSender) => sender.tab!;

const handlers: { [K in ApiType]: Handler<K> } = {
  remember: (a) => store.rememberPick(a.host, a.id, a.label, a.name),
  pin: (a) => store.pinKey(a.host, a.id, a.key, a.name),
  'forget-labels': (a) => store.forgetLabels(a.host, a.ids),
  'undo-promotion': (a) => store.undoPromotion(a.host),
  'forget-site': (a) => store.forgetSite(a.host),
  'forget-all': () => store.forgetAll(),
  'set-alphabet': (a) => store.setAlphabet(a.alphabet),
  import: (a) => store.importBackup(a.data),
  'settings-patch': (a) => store.updateSettings((s) => ({ ...s, ...a.patch })),
  'toggle-site': (a) => store.toggleSite(a.host),
  'toggle-pass-key': (a) => store.togglePassKey(a.host, a.key),
  'learn-add': (a) => store.learnAdd(a.host, a.selector),
  'learn-forget': (a) => store.learnForget(a.host),
  'tip-once': (a) => store.tipOnce(a.id),
  'tips-reset': () => store.tipsReset(),
  'next-tab': async (_, s) => { await tabs.switchTabBy(tabOf(s), 1); return ok; },
  'prev-tab': async (_, s) => { await tabs.switchTabBy(tabOf(s), -1); return ok; },
  'last-tab': (_, s) => tabs.lastTab(tabOf(s)),
  'new-tab': async (_, s) => { await chrome.tabs.create({ index: tabOf(s).index + 1, openerTabId: tabOf(s).id }); return ok; },
  'close-tab': async (_, s) => { await chrome.tabs.remove(tabOf(s).id!); return ok; },
  'mute-tab': async (_, s) => { await tabs.toggleMute(tabOf(s)); return ok; },
  'mute-other-tabs': async (_, s) => { await tabs.muteOtherTabs(tabOf(s)); return ok; },
  'switch-tab': async (a) => {
    await chrome.tabs.update(a.tabId, { active: true });
    await chrome.windows.update(a.windowId, { focused: true });
    return ok;
  },
  'open-url': async (a, s) => {
    const tab = tabOf(s);
    if (a.background) await chrome.tabs.create({ url: a.url, active: false, index: tab.index + 1, openerTabId: tab.id });
    else await chrome.tabs.update(tab.id!, { url: a.url });
    return ok;
  },
  // Content scripts can't open background tabs themselves.
  'open-tab': async (a, s) => {
    await chrome.tabs.create({ url: a.url, active: false, index: tabOf(s).index + 1, openerTabId: tabOf(s).id });
    return ok;
  },
  'close-tabs': (a, s) => tabs.closeTabs(tabOf(s), a.which),
  'tab-group': (a, s) => tabs.tabGroup(tabOf(s), a.op, a.groupId),
  'tab-action': (a, s) => tabs.tabAction(tabOf(s), a.op),
  'reopen-tab': (a) => tabs.reopenTab(a.sessionId),
  capture: (_, s) => tabs.capture(tabOf(s)),
  'palette-query': (a, s) => tabs.paletteQuery(a.q, tabOf(s)),
  'open-options': async () => { await chrome.runtime.openOptionsPage(); return ok; },
  'site-state': async (a, s) => {
    const tabId = tabOf(s).id;
    await chrome.action.setBadgeText({ tabId, text: a.disabled ? 'off' : '' });
    await chrome.action.setTitle({
      tabId,
      title: a.disabled ? 'KeyHints: single-key shortcuts OFF here (click to turn on)' : 'KeyHints: click to turn single-key shortcuts off here',
    });
    return ok;
  },
  // Relays between frames of one tab (child frames can't message the top frame directly).
  'to-top': async (a, s) => {
    await chrome.tabs.sendMessage(tabOf(s).id!, { ...a.payload, fromFrame: s.frameId }, { frameId: 0 });
    return ok;
  },
  'to-frames': async (a, s) => {
    await chrome.tabs.sendMessage(tabOf(s).id!, a.payload, a.frameId === undefined ? {} : { frameId: a.frameId });
    return ok;
  },
};

export default defineBackground(() => {
  chrome.commands.onCommand.addListener((command, tab) => {
    if (!tab) return;
    if (command === 'show-hints') toPage(tab, { type: 'toggle-hints' });
    if (command === 'toggle-mute') tabs.toggleMute(tab);
    if (command === 'mute-other-tabs') tabs.muteOtherTabs(tab);
    if (command === 'open-palette') toPage(tab, { type: 'open-palette' });
    if (command === 'post-mode') toPage(tab, { type: 'item-mode' });
  });

  // Toolbar button: single-key shortcuts on/off for the current site.
  chrome.action.onClicked.addListener((tab) => toPage(tab, { type: 'toggle-site' }));
  chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });

  chrome.runtime.onMessage.addListener((msg: { type: ApiType } & Record<string, unknown>, sender, sendResponse) => {
    const handler = handlers[msg.type] as Handler<ApiType> | undefined;
    if (!handler) return false; // a message for content scripts
    handler(msg as never, sender).then(sendResponse, (err: Error) => {
      console.error(`KeyHints: ${msg.type} failed`, err);
      sendResponse({ failed: err.message }); // call() rethrows it on the asking side
    });
    return true; // answered asynchronously
  });

  tabs.trackRecentTabs();
  installSync();
  chrome.runtime.onStartup.addListener(reconcileSync);
  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    await store.checkSchema();
    await reconcileSync();
    await injectIntoOpenTabs();
    // The practice page, on first install only (not on updates or browser restarts).
    if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
  });
});
