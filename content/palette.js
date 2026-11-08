// Command palette (Alt+K): type, or dictate, what you want; Enter runs the highlighted match.
// Searches commands, what's clickable on screen, open tabs, bookmarks and history.

const bg = (type, extra = {}) => chrome.runtime.sendMessage({ type, ...extra });

const COMMANDS = [
  ['Go back', 'back previous page return', () => history.back()],
  ['Go forward', 'forward', () => history.forward()],
  ['Reload page', 'reload refresh', () => location.reload()],
  ['Scroll down', 'down page down', () => scrollBy({ top: innerHeight * 0.8 })],
  ['Scroll up', 'up page up', () => scrollBy({ top: -innerHeight * 0.8 })],
  ['Scroll to top', 'top start beginning', () => scrollTo({ top: 0 })],
  ['Scroll to bottom', 'bottom end', () => scrollTo({ top: document.documentElement.scrollHeight })],
  ['New tab', 'open new tab', () => bg('new-tab')],
  ['Close tab', 'close tab', () => bg('close-tab')],
  ['Next tab', 'next tab right', () => bg('next-tab')],
  ['Previous tab', 'previous tab left', () => bg('prev-tab')],
  ['Last used tab', 'last recent used tab back switch before', () => lastTab()],
  ['Close other tabs', 'close other tabs all except this', () => closeTabs('others')],
  ['Close tabs to the right', 'close tabs right after', () => closeTabs('right')],
  ['Close duplicate tabs', 'close duplicate tabs same dedupe', () => closeTabs('duplicates')],
  ['Next page', 'next page older more pagination', () => followPageLink(1)],
  ['Previous page', 'previous page newer pagination', () => followPageLink(-1)],
  ['Mute / unmute tab', 'mute unmute sound audio silence tab', () => bg('mute-tab')],
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
    const n = await forgetLearned(); // learn.js
    toast(n ? `Forgot ${n} learned click target${n === 1 ? '' : 's'} on ${location.hostname}` : 'Nothing learned from clicks here');
  }],
  ['Move tab to a new group', 'tab group new create add', () => tabGroup('new')],
  ['Remove tab from its group', 'tab group remove ungroup leave', () => tabGroup('leave')],
  ['Collapse other tab groups', 'tab groups collapse fold others', () => tabGroup('collapse-others')],
  ['Next tab group', 'tab group next switch jump', () => tabGroup('next')],
  ['Repeat last action', 'again repeat', () => repeatLast()],
  ['Settings', 'settings options preferences', () => bg('open-options')],
  ['Single-key shortcuts on/off here', 'toggle site shortcuts disable enable', () => toggleSite()],
].map(([title, words, run]) => ({ kind: 'command', title, words, run }));

async function tabGroup(op, groupId) {
  const { message } = await bg('tab-group', { op, groupId });
  if (message) toast(message);
}

// Pinned tabs are kept, as with the browser's own "Close other tabs".
async function closeTabs(which) {
  const { closed } = await bg('close-tabs', { which });
  toast(closed ? `Closed ${closed} tab${closed === 1 ? '' : 's'}` : 'No tabs to close');
}

const KIND_ORDER = { command: 0, page: 1, tab: 2, bookmark: 3, history: 4 };
const KIND_LABEL = { command: 'do', page: 'click', tab: 'tab', bookmark: 'bookmark', history: 'history' };
// Spoken or typed filler that shouldn't have to match ("click the reply button").
const FILLER = new Set(['please', 'the', 'a', 'an', 'click', 'press', 'tap', 'open', 'go', 'to', 'on', 'button', 'link']);

function normalizeQuery(q) {
  return q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Every word must appear in the title, the command's extra words, or the URL. Words at the start
// of the title or of a word score higher; a word found only in the URL counts for very little.
function score(words, item) {
  const title = item.title.toLowerCase();
  const hay = `${title} ${item.words || ''}`.toLowerCase();
  const url = (item.url || '').toLowerCase();
  let total = 0;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) {
      if (!url.includes(w)) return null;
      total += 0.25;
      continue;
    }
    total += i === 0 ? 3 : /[^\p{L}\p{N}]/u.test(hay[i - 1]) ? 2 : 1;
    if (title.startsWith(w)) total += 2;
  }
  return total;
}

function rank(query, items) {
  const all = normalizeQuery(query).split(' ').filter(Boolean);
  const attempt = (words) => items
    .map((item) => ({ item, s: words.length ? score(words, item) : 0 }))
    .filter((r) => r.s !== null)
    .sort((a, b) => b.s - a.s || KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind]);
  let ranked = attempt(all);
  if (!ranked.length) ranked = attempt(all.filter((w) => !FILLER.has(w)));
  return ranked.slice(0, 8).map((r) => r.item);
}

function pageItems() {
  return findClickables()
    .filter((t) => t.text)
    .map((t) => ({ kind: 'page', title: t.text.slice(0, 80), url: t.href || '', run: () => activate(t, 'click') }));
}

function startPalette() {
  const { host, root } = createHost();
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
  footer.textContent = 'Enter run · ↑ ↓ choose · Shift+Enter background tab · Esc close';
  box.append(input, list, footer);
  root.appendChild(box);
  setState({
    phase: 'palette', input, list, footer, host, results: [], selected: 0, autoRun: null, seq: 0,
    // Commands for this page first (sites.js: GitHub / Jira; video.js while a video is on screen),
    // so they lead the list before you type.
    commands: mainVideo() ? [...siteCommands(), ...VIDEO_COMMANDS, ...COMMANDS] : [...siteCommands(), ...COMMANDS, ...VIDEO_COMMANDS],
    page: pageItems(), remote: [], returnFocus: document.activeElement, lastInputAt: 0,
  });
  input.addEventListener('input', onPaletteInput);
  input.focus();
  refreshPalette();
}

function leavePalette(prev) {
  clearTimeout(prev.autoRun);
  prev.host.remove();
  if (prev.returnFocus && prev.returnFocus.isConnected && prev.returnFocus.focus) prev.returnFocus.focus({ preventScroll: true });
}

async function refreshPalette() {
  const s = state;
  const seq = ++s.seq;
  const query = s.input.value;
  renderResults(s, query);
  const res = await chrome.runtime.sendMessage({ type: 'palette-query', q: normalizeQuery(query) });
  if (state !== s || seq !== s.seq) return; // closed, or a newer query is on its way
  s.remote = [
    ...res.tabs.map((t) => ({ kind: 'tab', title: t.title, url: t.url, run: () => bg('switch-tab', { tabId: t.id, windowId: t.windowId }) })),
    ...res.bookmarks.map((b) => ({ kind: 'bookmark', title: b.title || b.url, url: b.url })),
    ...res.history.map((h) => ({ kind: 'history', title: h.title || h.url, url: h.url })),
    ...res.groups.map((g) => ({ kind: 'command', title: `Move tab to group: ${g.title}`, words: 'tab group move add join',
      run: () => tabGroup('join', g.id) })),
    // Bookmarks and history are an optional permission, granted in settings (it needs a click there).
    ...(res.searchAllowed ? [] : [{ kind: 'command', title: 'Search bookmarks and history too (allow in settings)',
      words: 'bookmark bookmarks history allow search permission', run: () => bg('open-options') }]),
  ];
  renderResults(s, query);
}

function renderResults(s, query) {
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

function runResult(item, background) {
  setState(IDLE);
  if (item.run) return item.run();
  bg('open-url', { url: item.url, background }); // bookmarks and history
}

// Dictation arrives as a paste (Superwhisper) or as a burst of typed characters (typing tools).
// Either way, run the best match after a short pause, unless a real key is pressed first.
function onPaletteInput(e) {
  const s = state;
  const now = performance.now();
  const dictated = e.inputType === 'insertFromPaste' || (e.data && e.data.length > 1) || now - s.lastInputAt < 25;
  s.lastInputAt = now;
  s.selected = 0;
  clearTimeout(s.autoRun);
  s.autoRun = null;
  refreshPalette();
  if (!dictated) return;
  s.autoRun = setTimeout(() => {
    if (state !== s || !s.results.length) return;
    s.footer.textContent = `Running “${s.results[0].title}”`;
    runResult(s.results[0], false);
  }, 800);
  s.footer.textContent = 'Voice command: running the top match in a moment · any key to stop';
}

function paletteKey(e) {
  const s = state;
  e.stopImmediatePropagation(); // the page never sees keys typed into the palette
  if (e.key === 'Escape') { e.preventDefault(); return setState(IDLE); }
  if (s.autoRun && !(e.ctrlKey && e.key.toLowerCase() === 'v')) { // a real key cancels a pending voice run
    clearTimeout(s.autoRun);
    s.autoRun = null;
    s.footer.textContent = 'Enter run · ↑ ↓ choose · Shift+Enter background tab · Esc close';
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
