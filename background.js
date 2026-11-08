// Sends a toolbar / shortcut action to the page. Tabs opened before KeyHints was installed or
// updated, and pages Chromium keeps extensions out of (chrome://, the Web Store), have no content
// script: say so on the toolbar button instead of doing nothing.
async function toPage(tab, msg) {
  try {
    await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 });
  } catch (err) {
    if (!/Receiving end does not exist/.test(err.message)) throw err;
    const restricted = !/^(https?|file):/.test(tab.url || '');
    chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    chrome.action.setTitle({
      tabId: tab.id,
      title: restricted ? 'KeyHints: browser pages like this one can\'t be used' : 'KeyHints: reload this page to use KeyHints here',
    });
  }
}

// Alt+J arrives here (browser-level shortcut), then is forwarded to the page.
function toggleHints(tab) {
  return toPage(tab, { type: 'toggle-hints' });
}

// Mutes only this tab (not the per-site "Mute site" setting, which persists).
function toggleMute(tab) {
  return chrome.tabs.update(tab.id, { muted: !tab.mutedInfo.muted });
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'show-hints') toggleHints(tab);
  if (command === 'toggle-mute') toggleMute(tab);
  if (command === 'open-palette') toPage(tab, { type: 'open-palette' });
  if (command === 'post-mode') toPage(tab, { type: 'item-mode' });
});

// The practice page, on first install only (not on updates or browser restarts).
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: 'welcome.html' });
});

// Bookmarks and history are optional permissions, granted from settings or the welcome page.
const SEARCH_PERMISSIONS = { permissions: ['bookmarks', 'history'] };

// Palette sources: open tabs, plus bookmarks and history matching the query when allowed.
async function paletteQuery(q, tab) {
  const searchAllowed = await chrome.permissions.contains(SEARCH_PERMISSIONS);
  const [tabs, bookmarks, history, groups] = await Promise.all([
    chrome.tabs.query({}),
    q && searchAllowed ? chrome.bookmarks.search(q) : [],
    q && searchAllowed ? chrome.history.search({ text: q, maxResults: 15, startTime: 0 }) : [],
    chrome.tabGroups.query({ windowId: tab.windowId }),
  ]);
  return {
    searchAllowed,
    // Groups in this window other than the tab's own, for "Move tab to group: …".
    groups: groups.filter((g) => g.id !== tab.groupId).map((g) => ({ id: g.id, title: g.title || `${g.color} group` })),
    tabs: tabs.map((t) => ({ id: t.id, windowId: t.windowId, title: t.title, url: t.url })),
    bookmarks: bookmarks.filter((b) => b.url).slice(0, 15).map((b) => ({ title: b.title, url: b.url })),
    history: history.map((h) => ({ title: h.title, url: h.url })),
  };
}

// Tab groups, from the palette. `op`: new (a group of its own), join (groupId), leave,
// collapse-others, next (first tab of the next group, opened up if collapsed).
async function tabGroup(tab, op, groupId) {
  if (op === 'new') {
    await chrome.tabs.group({ tabIds: tab.id });
    return { ok: true, message: 'Moved the tab to a new group' };
  }
  if (op === 'join') {
    await chrome.tabs.group({ tabIds: tab.id, groupId });
    return { ok: true, message: 'Moved the tab to the group' };
  }
  if (op === 'leave') {
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return { ok: false, message: 'This tab is not in a group' };
    await chrome.tabs.ungroup(tab.id);
    return { ok: true, message: 'Took the tab out of its group' };
  }
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
  if (op === 'collapse-others') {
    const open = groups.filter((g) => g.id !== tab.groupId && !g.collapsed);
    await Promise.all(open.map((g) => chrome.tabGroups.update(g.id, { collapsed: true })));
    return { ok: true, message: open.length ? `Collapsed ${open.length} group${open.length === 1 ? '' : 's'}` : 'No other open groups' };
  }
  if (op === 'next') {
    const tabs = await chrome.tabs.query({ windowId: tab.windowId }); // in tab-strip order
    const firstTabs = groups.map((g) => tabs.find((t) => t.groupId === g.id)).filter(Boolean).sort((a, b) => a.index - b.index);
    if (!firstTabs.length) return { ok: false, message: 'No tab groups in this window' };
    const next = firstTabs.find((t) => t.index > tab.index && t.groupId !== tab.groupId) || firstTabs[0];
    await chrome.tabGroups.update(next.groupId, { collapsed: false });
    await chrome.tabs.update(next.id, { active: true });
    return { ok: true, message: '' };
  }
  throw new Error(`KeyHints: unknown tab-group op "${op}"`);
}

async function switchTabBy(tab, step) {
  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  const next = tabs[(tab.index + step + tabs.length) % tabs.length];
  return chrome.tabs.update(next.id, { active: true });
}

// Recently used tabs per window, most recent first, for "`" (back to the tab used before).
// Kept in session storage: the service worker is stopped when idle and its variables go with it.
// Every change runs after the previous one, so quick tab switches can't overwrite each other.
let recent = chrome.storage.session.get('recent').then((r) => r.recent || {}); // { [windowId]: [tabId, …] }
function updateRecent(change) {
  recent = recent.then((r) => {
    change(r);
    chrome.storage.session.set({ recent: r });
    return r;
  });
  return recent;
}

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => updateRecent((r) => {
  r[windowId] = [tabId, ...(r[windowId] || []).filter((id) => id !== tabId)].slice(0, 20);
}));
chrome.tabs.onRemoved.addListener((tabId, { windowId }) => updateRecent((r) => {
  if (r[windowId]) r[windowId] = r[windowId].filter((id) => id !== tabId);
}));
chrome.windows.onRemoved.addListener((windowId) => updateRecent((r) => { delete r[windowId]; }));

async function lastTab(tab) {
  const r = await recent;
  const previous = (r[tab.windowId] || []).find((id) => id !== tab.id);
  if (previous === undefined) return { ok: false, error: 'No previous tab in this window yet' };
  await chrome.tabs.update(previous, { active: true });
  return { ok: true };
}

// Pinned tabs are never closed. Duplicates: same address (ignoring #…); the current tab is the one kept.
async function closeTabs(tab, which) {
  const tabs = await chrome.tabs.query({ windowId: tab.windowId, pinned: false });
  const bare = (url) => (url || '').split('#')[0];
  let doomed;
  if (which === 'others') doomed = tabs.filter((t) => t.id !== tab.id);
  else if (which === 'right') doomed = tabs.filter((t) => t.index > tab.index);
  else if (which === 'duplicates') {
    const seen = new Set([bare(tab.url)]);
    doomed = tabs.filter((t) => {
      if (t.id === tab.id) return false;
      if (seen.has(bare(t.url))) return true;
      seen.add(bare(t.url));
      return false;
    });
  } else throw new Error(`KeyHints: unknown close-tabs "${which}"`);
  if (doomed.length) await chrome.tabs.remove(doomed.map((t) => t.id));
  return { closed: doomed.length };
}

// The visible part of the tab, for saving a post as an image (needs the <all_urls> host permission).
async function capture(tab) {
  try {
    return { ok: true, dataUrl: await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Toolbar button: single-key shortcuts on/off for the current site (the page knows its host).
chrome.action.onClicked.addListener((tab) => toPage(tab, { type: 'toggle-site' }));

chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const answer = {
    'palette-query': () => paletteQuery(msg.q, sender.tab),
    'tab-group': () => tabGroup(sender.tab, msg.op, msg.groupId),
    'last-tab': () => lastTab(sender.tab),
    'close-tabs': () => closeTabs(sender.tab, msg.which),
    capture: () => capture(sender.tab),
  }[msg.type];
  if (answer) {
    answer().then(sendResponse);
    return true; // answered asynchronously
  }
  sendResponse({ ok: true });
  const tabId = sender.tab && sender.tab.id;
  switch (msg.type) {
    case 'switch-tab':
      chrome.tabs.update(msg.tabId, { active: true });
      chrome.windows.update(msg.windowId, { focused: true });
      break;
    case 'open-url':
      if (msg.background) chrome.tabs.create({ url: msg.url, active: false, index: sender.tab.index + 1, openerTabId: tabId });
      else chrome.tabs.update(tabId, { url: msg.url });
      break;
    case 'new-tab': chrome.tabs.create({ index: sender.tab.index + 1, openerTabId: tabId }); break;
    case 'close-tab': chrome.tabs.remove(tabId); break;
    case 'next-tab': switchTabBy(sender.tab, 1); break;
    case 'prev-tab': switchTabBy(sender.tab, -1); break;
    case 'mute-tab': toggleMute(sender.tab); break;
    case 'open-tab': // content scripts can't open background tabs themselves
      chrome.tabs.create({ url: msg.url, active: false, index: sender.tab.index + 1, openerTabId: tabId });
      break;
    case 'open-options':
      chrome.runtime.openOptionsPage();
      break;
    case 'site-state':
      chrome.action.setBadgeText({ tabId, text: msg.disabled ? 'off' : '' });
      chrome.action.setTitle({
        tabId,
        title: msg.disabled ? 'KeyHints: single-key shortcuts OFF here (click to turn on)' : 'KeyHints: click to turn single-key shortcuts off here',
      });
      break;
    // Relays between frames of one tab (child frames can't message the top frame directly).
    case 'to-top':
      chrome.tabs.sendMessage(tabId, { ...msg.payload, fromFrame: sender.frameId }, { frameId: 0 });
      break;
    case 'to-frames':
      chrome.tabs.sendMessage(tabId, msg.payload, msg.frameId === undefined ? {} : { frameId: msg.frameId });
      break;
  }
});
