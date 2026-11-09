// Command palette (Alt+K): type, or dictate, what you want; Enter runs the highlighted match.
// Searches commands, what's clickable on screen, open and closed tabs, bookmarks and history.

import { normalizeQuery, rank, type Rankable } from '../core/rank';
import { call } from '../shared/messages';
import { createHost, toast } from '../dom/overlay';
import { findClickables } from '../dom/targets';
import { activate, copyText } from './activate';
import { repeatLast, start, undoNewKey } from './hints';
import { actOnCentre, copyPostText, onCentre, savePostImage, startItems } from './items';
import { followPageLink, siteCommands } from './sites';
import { mainVideo, VIDEO_COMMANDS } from './video';
import { startHelp } from './help';
import { forgetLearned } from './learn';
import { startPassKey, toggleSite } from './site-switch';
import { host, isLearned } from './store';
import { IDLE, inPhase, onLeave, setState, state } from './state';

export interface PaletteItem extends Rankable {
  run?: () => unknown;
}

export interface PaletteState {
  phase: 'palette';
  host: HTMLElement;
  input: HTMLInputElement;
  list: HTMLUListElement;
  footer: HTMLElement;
  results: PaletteItem[];
  selected: number;
  autoRun: number | null; // pending voice run
  seq: number; // newest background query
  commands: PaletteItem[];
  page: PaletteItem[];
  remote: PaletteItem[];
  returnFocus: Element | null;
  lastInputAt: number;
}

// Asks the background script to do something and shows its answer, if it has one.
async function bgToast<K extends 'reopen-tab' | 'tab-action' | 'tab-group'>(type: K, args: Parameters<typeof call<K>>[1]) {
  const res = await call(type, args) as { message?: string };
  if (res.message) toast(res.message);
}

async function closeTabs(which: 'others' | 'right' | 'duplicates') {
  const { closed } = await call('close-tabs', { which });
  toast(closed ? `Closed ${closed} tab${closed === 1 ? '' : 's'}` : 'No tabs to close'); // pinned tabs are kept
}

async function lastTab() {
  const res = await call('last-tab');
  if (!res.ok) toast(res.message);
}

const COMMANDS: PaletteItem[] = ([
  ['Go back', 'back previous page return', () => history.back()],
  ['Go forward', 'forward', () => history.forward()],
  ['Reload page', 'reload refresh', () => location.reload()],
  ['Scroll down', 'down page down', () => scrollBy({ top: innerHeight * 0.8 })],
  ['Scroll up', 'up page up', () => scrollBy({ top: -innerHeight * 0.8 })],
  ['Scroll to top', 'top start beginning', () => scrollTo({ top: 0 })],
  ['Scroll to bottom', 'bottom end', () => scrollTo({ top: document.documentElement.scrollHeight })],
  ['New tab', 'open new tab', () => call('new-tab')],
  ['Close tab', 'close tab', () => call('close-tab')],
  ['Next tab', 'next tab right', () => call('next-tab')],
  ['Previous tab', 'previous tab left', () => call('prev-tab')],
  ['Last used tab', 'last recent used tab back switch before', () => lastTab()],
  ['Close other tabs', 'close other tabs all except this', () => closeTabs('others')],
  ['Close tabs to the right', 'close tabs right after', () => closeTabs('right')],
  ['Close duplicate tabs', 'close duplicate tabs same dedupe', () => closeTabs('duplicates')],
  ['Reopen closed tab', 'reopen closed tab undo restore last', () => bgToast('reopen-tab', {})],
  ['Duplicate tab', 'duplicate tab copy clone', () => bgToast('tab-action', { op: 'duplicate' })],
  ['Pin / unpin tab', 'pin unpin tab', () => bgToast('tab-action', { op: 'pin' })],
  ['Move tab to a new window', 'move tab new window detach separate', () => bgToast('tab-action', { op: 'new-window' })],
  ['Next page', 'next page older more pagination', () => followPageLink(1)],
  ['Previous page', 'previous page newer pagination', () => followPageLink(-1)],
  ['Mute / unmute tab', 'mute unmute sound audio silence tab', () => call('mute-tab')],
  ['Mute / unmute this tab, mute all others', 'mute unmute other tabs all except this sound audio silence', () => call('mute-other-tabs')],
  ['Copy page address', 'copy url link address page', () => copyText(location.href, 'Copied')],
  ['Show hints', 'hints click', () => start('click')],
  ['Copy a link', 'copy link hints', () => start('copy')],
  ['Scroll a panel', 'scroll panel sidebar', () => start('scroll')],
  ['Select text', 'select text copy', () => start('text')],
  ['Post mode', 'posts items cards feed', () => startItems()],
  ['Like the post in the middle', 'like heart favourite favorite', () => actOnCentre('l')],
  ['Reply to the post in the middle', 'reply comment', () => actOnCentre('r')],
  ['Repost the post in the middle', 'repost retweet share', () => actOnCentre('t')],
  ['Bookmark the post in the middle', 'bookmark save', () => actOnCentre('b')],
  ['Mute / unmute the video in the middle', 'mute unmute video sound', () => actOnCentre('m')],
  ['Play / pause the video in the middle', 'play pause video stop', () => actOnCentre('p')],
  ['Copy text of the post in the middle', 'copy post text words tweet', () => onCentre(copyPostText)],
  ['Save the post in the middle as an image', 'save post image picture screenshot download', () => onCentre(savePostImage)],
  ['Keys on this page', 'keys shortcuts help cheat sheet keyboard', () => startHelp()],
  ['Undo the last new single key', 'undo single key label learned revert', () => undoNewKey()],
  ['Leave a key to this site', 'leave key site pass through keep conflict shortcut', () => startPassKey()],
  ['Forget clicks learned here', 'forget learned clicks hints reset', async () => {
    const n = await forgetLearned();
    toast(n ? `Forgot ${n} learned click target${n === 1 ? '' : 's'} on ${host}` : 'Nothing learned from clicks here');
  }],
  ['Move tab to a new group', 'tab group new create add', () => bgToast('tab-group', { op: 'new' })],
  ['Remove tab from its group', 'tab group remove ungroup leave', () => bgToast('tab-group', { op: 'leave' })],
  ['Collapse other tab groups', 'tab groups collapse fold others', () => bgToast('tab-group', { op: 'collapse-others' })],
  ['Next tab group', 'tab group next switch jump', () => bgToast('tab-group', { op: 'next' })],
  ['Repeat last action', 'again repeat', () => repeatLast()],
  ['Settings', 'settings options preferences', () => call('open-options')],
  ['Single-key shortcuts on/off here', 'toggle site shortcuts disable enable', () => toggleSite()],
] as [string, string, () => unknown][]).map(([title, words, run]) => ({ kind: 'command', title, words, run }));

const KIND_LABEL: Record<PaletteItem['kind'], string> = { command: 'do', page: 'click', tab: 'tab', closed: 'closed', bookmark: 'bookmark', history: 'history' };
const FOOTER = 'Enter run · ↑ ↓ choose · Shift+Enter background tab · Esc close';

function pageItems(): PaletteItem[] {
  return findClickables(isLearned)
    .filter((t) => t.text)
    .map((t) => ({ kind: 'page', title: t.text.slice(0, 80), url: t.href || '', run: () => activate(t, 'click') }));
}

const palette = () => inPhase('palette');

export function startPalette() {
  const { host: overlay, root } = createHost();
  const box = document.createElement('div');
  box.className = 'palette';
  const input = document.createElement('input');
  input.className = 'pinput';
  input.placeholder = 'Type or say what you want…';
  input.setAttribute('aria-label', 'KeyHints command');
  const list = document.createElement('ul');
  list.className = 'results';
  const footer = document.createElement('div');
  footer.className = 'pfooter';
  footer.textContent = FOOTER;
  box.append(input, list, footer);
  root.appendChild(box);
  const s: PaletteState = {
    phase: 'palette', input, list, footer, host: overlay, results: [], selected: 0, autoRun: null, seq: 0,
    // Commands for this page first (GitHub / Jira; video controls while a video is on screen),
    // so they lead the list before you type.
    commands: mainVideo() ? [...siteCommands(), ...VIDEO_COMMANDS, ...COMMANDS] : [...siteCommands(), ...COMMANDS, ...VIDEO_COMMANDS],
    page: pageItems(), remote: [], returnFocus: document.activeElement, lastInputAt: 0,
  };
  setState(s);
  input.addEventListener('input', onPaletteInput);
  input.focus();
  refreshPalette();
}

onLeave('palette', (s) => {
  if (s.autoRun) clearTimeout(s.autoRun);
  s.host.remove();
  const back = s.returnFocus as HTMLElement | null;
  if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
});

async function refreshPalette() {
  const s = palette()!;
  const seq = ++s.seq;
  const query = s.input.value;
  renderResults(s, query);
  const res = await call('palette-query', { q: normalizeQuery(query) });
  if (state !== s || seq !== s.seq) return; // closed, or a newer query is on its way
  s.remote = [
    ...res.tabs.map((t): PaletteItem => ({ kind: 'tab', title: t.title, url: t.url, run: () => call('switch-tab', { tabId: t.id, windowId: t.windowId }) })),
    ...res.closed.map((c): PaletteItem => ({ kind: 'closed', title: c.title, url: c.url, words: 'reopen closed',
      run: () => bgToast('reopen-tab', { sessionId: c.sessionId }) })),
    ...res.bookmarks.map((b): PaletteItem => ({ kind: 'bookmark', title: b.title || b.url, url: b.url })),
    ...res.history.map((h): PaletteItem => ({ kind: 'history', title: h.title || h.url, url: h.url })),
    ...res.groups.map((g): PaletteItem => ({ kind: 'command', title: `Move tab to group: ${g.title}`, words: 'tab group move add join',
      run: () => bgToast('tab-group', { op: 'join', groupId: g.id }) })),
    // Bookmarks and history are an optional permission, granted in settings (it needs a click there).
    ...(res.searchAllowed ? [] : [{ kind: 'command', title: 'Search bookmarks and history too (allow in settings)',
      words: 'bookmark bookmarks history allow search permission', run: () => call('open-options') } as PaletteItem]),
  ];
  renderResults(s, query);
}

function renderResults(s: PaletteState, query: string) {
  s.results = query.trim() ? rank(query, [...s.commands, ...s.page, ...s.remote]) : s.commands.slice(0, 8);
  s.selected = Math.min(s.selected, Math.max(0, s.results.length - 1));
  s.list.replaceChildren(...s.results.map((item, i) => {
    const li = document.createElement('li');
    li.className = i === s.selected ? 'result on' : 'result';
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = KIND_LABEL[item.kind];
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = item.title;
    li.append(kind, title);
    if (item.url && item.kind !== 'page') {
      const url = document.createElement('span');
      url.className = 'url';
      url.textContent = item.url;
      li.append(url);
    }
    return li;
  }));
  if (!s.results.length) s.list.textContent = 'No matches';
}

function runResult(item: PaletteItem, background: boolean) {
  setState(IDLE);
  if (item.run) return item.run();
  call('open-url', { url: item.url!, background }); // bookmarks and history
}

// Dictation arrives as a paste (Superwhisper) or as a burst of typed characters (typing tools).
// Either way, run the best match after a short pause, unless a real key is pressed first.
function onPaletteInput(e: Event) {
  const s = palette()!;
  const ie = e as InputEvent;
  const now = performance.now();
  const dictated = ie.inputType === 'insertFromPaste' || (!!ie.data && ie.data.length > 1) || now - s.lastInputAt < 25;
  s.lastInputAt = now;
  s.selected = 0;
  if (s.autoRun) clearTimeout(s.autoRun);
  s.autoRun = null;
  refreshPalette();
  if (!dictated) return;
  s.autoRun = window.setTimeout(() => {
    if (state !== s || !s.results.length) return;
    s.footer.textContent = `Running “${s.results[0].title}”`;
    runResult(s.results[0], false);
  }, 800);
  s.footer.textContent = 'Voice command: running the top match in a moment · any key to stop';
}

export function paletteKey(e: KeyboardEvent) {
  const s = palette()!;
  e.stopImmediatePropagation(); // the page never sees keys typed into the palette
  if (e.key === 'Escape') { e.preventDefault(); return setState(IDLE); }
  if (s.autoRun && !(e.ctrlKey && e.key.toLowerCase() === 'v')) { // a real key cancels a pending voice run
    clearTimeout(s.autoRun);
    s.autoRun = null;
    s.footer.textContent = FOOTER;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!s.results.length) return;
    s.selected = (s.selected + (e.key === 'ArrowDown' ? 1 : -1) + s.results.length) % s.results.length;
    return renderResults(s, s.input.value);
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const item = s.results[s.selected];
    if (item) runResult(item, e.shiftKey);
  }
}

export const inPalette = () => inPhase('palette') !== null;
