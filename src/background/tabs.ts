// Tabs and windows: switching, muting, closing, groups, reopening, and the palette's data.

import type { Api, PaletteData } from '../shared/messages';
import { searchAllowed } from '../shared/permissions';

type Tab = chrome.tabs.Tab;

// Mutes only this tab (not the per-site "Mute site" setting, which persists).
export const toggleMute = (tab: Tab) => chrome.tabs.update(tab.id!, { muted: !tab.mutedInfo?.muted });

// Alt+M: mutes / unmutes this tab, and mutes every other tab in every window (including ones not
// playing yet).
export async function muteOtherTabs(tab: Tab) {
  const others = (await chrome.tabs.query({ muted: false })).filter((t) => t.id !== tab.id);
  await Promise.all([toggleMute(tab), ...others.map((t) => chrome.tabs.update(t.id!, { muted: true }))]);
}

export async function switchTabBy(tab: Tab, step: number) {
  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  const next = tabs[(tab.index + step + tabs.length) % tabs.length];
  await chrome.tabs.update(next.id!, { active: true });
}

// Recently used tabs per window, most recent first, for "`" (back to the tab used before). Kept in
// session storage: the service worker is stopped when idle and its variables go with it. Every
// change runs after the previous one, so quick tab switches can't overwrite each other.
type Recent = Record<number, number[]>;
let recent: Promise<Recent> = chrome.storage.session.get('recent').then((r) => (r.recent as Recent) || {});
function updateRecent(change: (r: Recent) => void) {
  recent = recent.then((r) => {
    change(r);
    chrome.storage.session.set({ recent: r });
    return r;
  });
}

export function trackRecentTabs() {
  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => updateRecent((r) => {
    r[windowId] = [tabId, ...(r[windowId] || []).filter((id) => id !== tabId)].slice(0, 20);
  }));
  chrome.tabs.onRemoved.addListener((tabId, { windowId }) => updateRecent((r) => {
    if (r[windowId]) r[windowId] = r[windowId].filter((id) => id !== tabId);
  }));
  chrome.windows.onRemoved.addListener((windowId) => updateRecent((r) => { delete r[windowId]; }));
}

export async function lastTab(tab: Tab): Promise<Api['last-tab'][1]> {
  const r = await recent;
  const previous = (r[tab.windowId] || []).find((id) => id !== tab.id);
  if (previous === undefined) return { ok: false, message: 'No previous tab in this window yet' };
  await chrome.tabs.update(previous, { active: true });
  return { ok: true };
}

// Pinned tabs are never closed. Duplicates: same address (ignoring #…); the current tab is kept.
export async function closeTabs(tab: Tab, which: 'others' | 'right' | 'duplicates') {
  const tabs = await chrome.tabs.query({ windowId: tab.windowId, pinned: false });
  const bare = (url?: string) => (url || '').split('#')[0];
  let doomed: Tab[];
  if (which === 'others') doomed = tabs.filter((t) => t.id !== tab.id);
  else if (which === 'right') doomed = tabs.filter((t) => t.index > tab.index);
  else {
    const seen = new Set([bare(tab.url)]);
    doomed = tabs.filter((t) => {
      if (t.id === tab.id) return false;
      if (seen.has(bare(t.url))) return true;
      seen.add(bare(t.url));
      return false;
    });
  }
  if (doomed.length) await chrome.tabs.remove(doomed.map((t) => t.id!));
  return { closed: doomed.length };
}

// Tab groups, from the palette. `op`: new (a group of its own), join (groupId), leave,
// collapse-others, next (first tab of the next group, opened up if collapsed).
export async function tabGroup(tab: Tab, op: Api['tab-group'][0]['op'], groupId?: number) {
  if (op === 'new') {
    await chrome.tabs.group({ tabIds: tab.id! });
    return { ok: true, message: 'Moved the tab to a new group' };
  }
  if (op === 'join') {
    await chrome.tabs.group({ tabIds: tab.id!, groupId });
    return { ok: true, message: 'Moved the tab to the group' };
  }
  if (op === 'leave') {
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return { ok: false, message: 'This tab is not in a group' };
    await chrome.tabs.ungroup(tab.id!);
    return { ok: true, message: 'Took the tab out of its group' };
  }
  const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
  if (op === 'collapse-others') {
    const open = groups.filter((g) => g.id !== tab.groupId && !g.collapsed);
    await Promise.all(open.map((g) => chrome.tabGroups.update(g.id, { collapsed: true })));
    return { ok: true, message: open.length ? `Collapsed ${open.length} group${open.length === 1 ? '' : 's'}` : 'No other open groups' };
  }
  const tabs = await chrome.tabs.query({ windowId: tab.windowId }); // in tab-strip order
  const firstTabs = groups.map((g) => tabs.find((t) => t.groupId === g.id)).filter((t): t is Tab => !!t).sort((a, b) => a.index - b.index);
  if (!firstTabs.length) return { ok: false, message: 'No tab groups in this window' };
  const next = firstTabs.find((t) => t.index > tab.index && t.groupId !== tab.groupId) || firstTabs[0];
  await chrome.tabGroups.update(next.groupId, { collapsed: false });
  await chrome.tabs.update(next.id!, { active: true });
  return { ok: true, message: '' };
}

// Palette tab commands: duplicate, pin / unpin, move to a new window of its own.
export async function tabAction(tab: Tab, op: 'duplicate' | 'pin' | 'new-window') {
  if (op === 'duplicate') await chrome.tabs.duplicate(tab.id!);
  else if (op === 'pin') await chrome.tabs.update(tab.id!, { pinned: !tab.pinned });
  else await chrome.windows.create({ tabId: tab.id!, focused: true });
  return { ok: true as const, message: op === 'pin' ? (tab.pinned ? 'Unpinned the tab' : 'Pinned the tab') : '' };
}

// Closed tabs, newest first, from the browser's own list (restored with their history).
async function closedTabs() {
  const items = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
  return items.flatMap((i) => (i.tab && i.tab.sessionId && /^(https?|file):/.test(i.tab.url || '')
    ? [{ sessionId: i.tab.sessionId, title: i.tab.title || i.tab.url!, url: i.tab.url! }] : []));
}

// Reopens the closed tab with this session id (the newest closed tab if none is given).
export async function reopenTab(sessionId?: string): Promise<Api['reopen-tab'][1]> {
  const id = sessionId || (await closedTabs())[0]?.sessionId;
  if (!id) return { ok: false, message: 'No closed tabs to reopen' };
  await chrome.sessions.restore(id);
  return { ok: true };
}

// The visible part of the tab, for saving a post as an image (needs the <all_urls> host permission).
export async function capture(tab: Tab): Promise<Api['capture'][1]> {
  if (!tab.active) return { ok: false, error: 'this tab is not the one in front' }; // the picture is of whatever tab is in front
  try {
    return { ok: true, dataUrl: await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Palette sources: open tabs, closed tabs, plus bookmarks and history matching the query when allowed.
export async function paletteQuery(q: string, tab: Tab): Promise<PaletteData> {
  const allowed = await searchAllowed();
  const [tabs, closed, bookmarks, history, groups] = await Promise.all([
    chrome.tabs.query({}),
    closedTabs(),
    q && allowed && !tab.incognito ? chrome.bookmarks.search(q) : Promise.resolve([] as chrome.bookmarks.BookmarkTreeNode[]),
    q && allowed && !tab.incognito ? chrome.history.search({ text: q, maxResults: 15, startTime: 0 }) : Promise.resolve([] as chrome.history.HistoryItem[]),
    chrome.tabGroups.query({ windowId: tab.windowId }),
  ]);
  return {
    searchAllowed: allowed,
    // Groups in this window other than the tab's own, for "Move tab to group: …".
    groups: groups.filter((g) => g.id !== tab.groupId).map((g) => ({ id: g.id, title: g.title || `${g.color} group` })),
    tabs: tabs.filter((t) => t.incognito === tab.incognito).map((t) => ({ id: t.id!, windowId: t.windowId, title: t.title || '', url: t.url || '' })),
    closed: tab.incognito ? [] : closed,
    bookmarks: bookmarks.filter((b) => b.url && !/^javascript:/i.test(b.url)).slice(0, 15) // bookmarklets can't be opened as a tab
     .map((b) => ({ title: b.title, url: b.url! })),
    history: history.map((h) => ({ title: h.title || '', url: h.url || '' })),
  };
}
