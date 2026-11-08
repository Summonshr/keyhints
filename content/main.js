// Hint sessions, mode keys, text selection, iframe coordination, activation and key handling.

const IS_TOP = window === window.top;

// Every hint mode. Modes sharing `targets` switch in place (labels stay the same);
// switching to a mode with other targets collects new hints.
const MODES = {
  click: { name: 'CLICK', targets: 'clickable' },
  copy: { name: 'COPY LINK', targets: 'clickable', key: 'c', linksOnly: true },
  newtab: { name: 'BACKGROUND TAB', targets: 'clickable', key: 'b', linksOnly: true },
  multi: { name: 'OPEN SEVERAL', targets: 'clickable', key: 'm', linksOnly: true },
  hover: { name: 'HOVER', targets: 'clickable', key: 'v' },
  focus: { name: 'FOCUS ONLY', targets: 'clickable', key: ';' }, // not n: N is free for labels (Notifications)
  scroll: { name: 'SCROLL PANEL', targets: 'scroll', key: 'x', help: 'pick a panel, then arrows / Space / PgDn scroll it' },
  text: { name: 'SELECT TEXT', targets: 'text', key: 'z', help: 'pick where to start' },
};
const MODE_BY_KEY = Object.fromEntries(Object.entries(MODES).filter(([, m]) => m.key).map(([id, m]) => [m.key, id]));

// ---------- page state: exactly one phase at a time, changed only through setState() ----------
//
//   idle ──y / ] / [──▶ prefix ──f / ] / [──▶ starting (yf) or idle (]] [[ follow the page link)
//                        └─other key─▶ idle
//   starting ──hints ready──▶ hinting ──pick/Esc──▶ idle
//                                          │                 │
//                                          └─cancel─▶ idle   └─x/z─▶ starting
//   idle ──text pick──▶ selecting ──y/Esc──▶ idle
//   idle ──Alt+I──▶ items ──f──▶ starting (hints inside the highlighted post)
//   idle ──Alt+K──▶ palette ──Enter──▶ idle (or starting / items, if the command does that)
//   idle ──?──▶ help ──any key──▶ idle
//
// prefix:    { key, expiresAt }               "y", "]" or "[" pressed, waiting up to 1 s for the second key
// starting:  { mode, scope, queued, collector }  collecting targets; keys typed meanwhile are queued
// hinting:   { mode, hints, typed, filter, pin, host, bar, nonce, frames }
// selecting: { selection, host, bar }         selection: 'caret' | 'extending'
// items:     { current, host, ring, bar }     current: the highlighted post / card
// palette:   { input, results, selected, host, list, footer, returnFocus, autoRun, seq }
// help:      { host }                         the key sheet (help.js)
// passkey:   { host }                         waiting for the key to leave to this site (or take back)
const TRANSITIONS = {
  idle: ['prefix', 'starting', 'selecting', 'items', 'palette', 'help', 'passkey'],
  prefix: ['idle', 'starting'],
  starting: ['idle', 'starting', 'hinting'],
  hinting: ['idle', 'starting'],
  selecting: ['idle', 'starting'],
  items: ['idle', 'starting'],
  palette: ['idle', 'starting', 'items'],
  help: ['idle'],
  passkey: ['idle'],
};
const IDLE = { phase: 'idle' };
let state = IDLE;

function setState(next) {
  if (!TRANSITIONS[state.phase].includes(next.phase)) {
    throw new Error(`KeyHints: no transition ${state.phase} -> ${next.phase}`);
  }
  const prev = state;
  state = next;
  if (prev.phase === 'hinting') {
    prev.host.remove();
    if (prev.frames.length) toFrames({ type: 'frame-stop' });
    removeEventListener('scroll', cancelHints, { capture: true });
    removeEventListener('resize', cancelHints);
    document.removeEventListener('visibilitychange', cancelHints);
  }
  if (prev.phase === 'selecting') {
    prev.host.remove();
    if (!next.keepSelection) getSelection().removeAllRanges();
  }
  if (prev.phase === 'items') leaveItems(prev); // items.js
  if (prev.phase === 'palette') leavePalette(prev); // palette.js
  if (prev.phase === 'help' || prev.phase === 'passkey') prev.host.remove();
  if (next.phase === 'hinting') {
    addEventListener('scroll', cancelHints, { capture: true, passive: true });
    addEventListener('resize', cancelHints);
    document.addEventListener('visibilitychange', cancelHints);
  }
}

function cancelHints() {
  if (state.phase === 'hinting') setState(IDLE);
}

// Filter by text inside a hint session: off -> typing -> applied, with these moves only.
const FILTER_TRANSITIONS = { off: ['typing'], typing: ['off', 'applied'], applied: ['off', 'typing'] };
function setFilter(s, status, text = '') {
  if (!FILTER_TRANSITIONS[s.filter.status].includes(status)) {
    throw new Error(`KeyHints: no filter transition ${s.filter.status} -> ${status}`);
  }
  s.filter = { status, text: status === 'off' ? '' : text };
}

// Pinning a key inside a hint session: none -> element (type its label) -> key (press the letter).
const PIN_TRANSITIONS = { none: ['element'], element: ['none', 'key'], key: ['none'] };
function setPin(s, pin) {
  if (!PIN_TRANSITIONS[s.pin.step].includes(pin.step)) throw new Error(`KeyHints: no pin transition ${s.pin.step} -> ${pin.step}`);
  s.pin = pin;
}

let hovered = null;
let lastPick = null; // { sig, mode } of the last pick on this page, for "." (repeat)

const toTop = (payload) => chrome.runtime.sendMessage({ type: 'to-top', payload });
const toFrames = (payload, frameId) => chrome.runtime.sendMessage({ type: 'to-frames', payload, frameId });

// ---------- hint session (top frame) ----------

async function start(mode, scope = null) {
  await ready;
  if (!IS_TOP) { // the top frame runs every session
    if (state.phase === 'prefix') setState(IDLE);
    return toTop({ type: 'start-request', mode });
  }
  const starting = { phase: 'starting', mode, scope, queued: [], collector: null };
  setState(starting);
  // Keys typed while focus is inside an iframe would never reach this window.
  if (document.activeElement && document.activeElement.tagName === 'IFRAME') document.activeElement.blur();

  const { targets, linksOnly } = MODES[mode];
  const local = collect(targets, scope || undefined);
  const { nonce, remote } = targets === 'clickable' && !scope ? await collectFrames(starting) : { nonce: null, remote: [] };
  if (state !== starting) return; // cancelled or restarted while waiting for frames
  const usable = (t) => !linksOnly || t.isLink;
  if (!local.some(usable) && !remote.some(usable)) {
    setState(IDLE);
    toast(linksOnly ? 'No links on screen' : targets === 'scroll' ? 'No scrollable panels on screen' : 'Nothing to pick on screen');
    return;
  }

  const labels = assignLabels(local, { useMemory: targets !== 'text', extra: remote.length });
  const { host, root } = createHost();
  const hints = local.map((t, i) => ({ ...t, ...labels.local[i], node: makeHintNode(root, t.rect) }));
  remote.forEach((r, i) => hints.push({ ...r, label: labels.extra[i], sig: null, node: null }));
  for (const h of hints) if (h.node) setHintText(h.node, h.label, '');
  layoutHints(hints.filter((h) => h.node));

  const bar = document.createElement('div');
  bar.className = 'bar';
  root.appendChild(bar);
  const frames = [...new Set(remote.map((r) => r.frameId))];
  setState({ phase: 'hinting', mode, hints, typed: '', filter: { status: 'off', text: '' }, pin: { step: 'none' }, host, bar, nonce, frames });
  for (const frameId of frames) {
    toFrames({ type: 'frame-show', nonce, labels: hints.filter((h) => h.frameId === frameId).map((h) => h.label) }, frameId);
  }
  render();

  // Replay keys typed while collecting. A key that restarts (x, z) hands the rest to the new start.
  for (const key of starting.queued) {
    if (state.phase === 'hinting') handleHintKey(key);
    else if (state.phase === 'starting') state.queued.push(key);
  }
}

function visibleHints(typed = state.typed) {
  const { mode, filter, hints } = state;
  const { linksOnly } = MODES[mode];
  const f = filter.text.toLowerCase();
  return hints.filter((h) => (!linksOnly || h.isLink) && (!f || h.text.toLowerCase().includes(f)) && h.label.startsWith(typed));
}

function render() {
  const s = state;
  const shown = new Set(visibleHints());
  for (const h of s.hints) {
    if (!h.node) continue;
    h.node.classList.toggle('hidden', !shown.has(h));
    h.node.classList.toggle('used', !!h.used);
    if (shown.has(h)) setHintText(h.node, h.label, s.typed);
  }
  for (const frameId of s.frames) {
    const mine = s.hints.filter((h) => h.frameId === frameId);
    toFrames({
      type: 'frame-render', nonce: s.nonce, typed: s.typed,
      show: mine.filter((h) => shown.has(h)).map((h) => h.label),
      used: mine.filter((h) => h.used).map((h) => h.label),
    }, frameId);
  }
  const nodes = s.hints.filter((h) => h.node).map((h) => h.node);
  renderSessionBar(shown.size, false);
  if (!placeBar(s.bar, nodes)) {
    renderSessionBar(shown.size, true); // only the mode name, so it fits somewhere empty
    placeBar(s.bar, nodes);
  }
}

function renderSessionBar(count, compact) {
  const s = state;
  const mode = MODES[s.mode];
  if (compact) return renderBar(s.bar, s.filter.status === 'typing' ? `/${s.filter.text}` : s.pin.step !== 'none' ? 'PIN' : mode.name, []);
  if (s.pin.step === 'element') return renderBar(s.bar, 'PIN A KEY', [['type the label of the element to pin'], ['Esc', 'cancel']]);
  if (s.pin.step === 'key') return renderBar(s.bar, 'PIN A KEY', [[`press the letter for "${s.pin.hint.text || 'this'}"`], ['Esc', 'cancel']]);
  if (s.filter.status === 'typing') {
    return renderBar(s.bar, 'FILTER', [[` /${s.filter.text}▏ `], [`${count} match${count === 1 ? '' : 'es'}`], ['Enter', 'done'], ['Esc', 'clear']]);
  }
  if (mode.help) return renderBar(s.bar, mode.name, [[mode.help], ['Esc', 'cancel']]);
  const parts = Object.entries(MODES).filter(([, m]) => m.key).map(([id, m]) => [m.key, m.name.toLowerCase(), s.mode === id]);
  const applied = s.filter.status === 'applied';
  parts.push(['/', applied ? `filter: ${s.filter.text}` : 'filter', applied], ['.', 'repeat'], ['!', 'pin a key'], ['?', 'all keys']);
  renderBar(s.bar, mode.name, parts);
}

function handleHintKey(e) {
  // Browser and page shortcuts (Ctrl+L, Ctrl+C, Tab…) cancel hints and go through untouched.
  if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab') return setState(IDLE);
  e.preventDefault();
  e.stopImmediatePropagation();
  const s = state;

  if (s.filter.status === 'typing') {
    if (e.key === 'Escape') { setFilter(s, 'off'); return render(); }
    if (e.key === 'Enter') {
      const matches = visibleHints();
      setFilter(s, s.filter.text ? 'applied' : 'off', s.filter.text);
      return matches.length === 1 ? pick(matches[0], false) : render();
    }
    if (e.key === 'Backspace') s.filter.text = s.filter.text.slice(0, -1);
    else if (e.key.length === 1) s.filter.text += e.key;
    return render();
  }

  if (s.pin.step === 'key') {
    const key = e.key.toLowerCase();
    if (e.key === 'Escape') { setPin(s, { step: 'none' }); return render(); }
    if (!singleKeyAllowed(key)) return;
    pin(s.pin.hint.sig, key);
    toast(`Pinned: ${s.pin.hint.text || 'element'} → ${key.toUpperCase()}`);
    return setState(IDLE);
  }

  if (e.key === 'Escape') {
    if (s.pin.step === 'element') { setPin(s, { step: 'none' }); return render(); }
    if (s.filter.status === 'applied') { setFilter(s, 'off'); return render(); }
    return setState(IDLE);
  }
  if (e.key === 'Backspace') { s.typed = s.typed.slice(0, -1); return render(); }
  if (e.key === '/') { setFilter(s, 'typing'); s.typed = ''; return render(); }
  if (e.key === '?') { setState(IDLE); return startHelp(); } // help.js: same as "?" outside hint mode
  if (e.key === '.') { setState(IDLE); return repeatLast(); }
  if (e.key === '!') { setPin(s, { step: 'element' }); s.typed = ''; return render(); }

  const key = e.key.toLowerCase();
  if (MODE_BY_KEY[key]) {
    const wanted = MODE_BY_KEY[key];
    const mode = s.mode === wanted ? 'click' : wanted; // the same key again goes back to click
    if (MODES[mode].targets !== MODES[s.mode].targets) return start(mode);
    s.mode = mode;
    s.typed = '';
    return render();
  }
  if (!/^[a-z]$/.test(key)) return; // remembered single keys may be letters outside the alphabet (n)

  const typed = s.typed + key;
  const matching = visibleHints(typed);
  if (matching.length === 0) return; // ignore keys that match nothing
  s.typed = typed;
  const exact = matching.find((h) => h.label === typed);
  if (!exact) return render();
  if (s.pin.step === 'element') {
    s.typed = '';
    if (!exact.sig) { setPin(s, { step: 'none' }); toast("That one can't be pinned (it's inside a frame or is text)"); return render(); }
    setPin(s, { step: 'key', hint: exact });
    return render();
  }
  pick(exact, e.shiftKey);
}

// "." in hint mode: do the last pick again, on the copy nearest the centre (e.g. like the next post).
function repeatLast() {
  if (!lastPick) return toast('Nothing to repeat yet');
  const copies = findClickables().filter((c) => signature(c.el, c.text) === lastPick.sig);
  if (!copies.length) return toast('Nothing to repeat here');
  const dist = ({ rect }) => Math.hypot(rect.left + rect.width / 2 - innerWidth / 2, rect.top + rect.height / 2 - innerHeight / 2);
  activate(copies.sort((a, b) => dist(a) - dist(b))[0], lastPick.mode);
}

function pick(hint, shift) {
  const s = state;
  let mode = s.mode;
  if (shift && mode === 'click' && hint.isLink) mode = 'newtab'; // Shift on the last letter
  const promoted = hint.sig ? remember(hint.sig, hint.label, hint.text) : null;
  if (hint.sig) lastPick = { sig: hint.sig, mode: mode === 'multi' ? 'newtab' : mode };
  if (promoted) {
    toast(`${hint.text || 'This'} now has its own key: ${promoted.toUpperCase()} (u to undo)`);
    undoUntil = Date.now() + 5000;
  }

  if (mode === 'multi') { // stay in hint mode; each pick opens another background tab
    openTab(hint.href);
    if (hint.node) flash(hint.rect);
    hint.used = true;
    s.typed = '';
    return render();
  }
  setState(IDLE);
  if (hint.frameId === undefined) return activate(hint, mode);
  if (mode === 'copy') return copyText(hint.href, 'Copied link');
  if (mode === 'newtab') return openTab(hint.href);
  toFrames({ type: 'frame-activate', nonce: s.nonce, index: hint.index, mode }, hint.frameId);
}

// ---------- activation ----------

function openTab(url) {
  chrome.runtime.sendMessage({ type: 'open-tab', url });
}

async function copyText(text, what) {
  if (!text) return toast('Nothing to copy');
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what}: ${text}`);
  } catch (err) {
    toast(`Copy failed: ${err.message}`);
  }
}

function focusField(el) {
  el.focus();
  if (el.isContentEditable) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (typeof el.selectionStart === 'number') {
    // Not available on email/number inputs (selectionStart is null there).
    el.setSelectionRange(el.value.length, el.value.length);
  }
}

// The innermost element under the centre, as a real mouse would hit it (handlers often
// sit on an inner span or icon rather than on the element that got the hint).
function pointAt(el, rect) {
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const hit = deepElementFromPoint(x, y);
  return { target: hit && contains(el, hit) ? hit : el, x, y };
}

function dispatchMouse(target, types, x, y) {
  for (const type of types) {
    const bubbles = !/enter|leave/.test(type);
    const init = { bubbles, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0 };
    if (type === 'mousedown' || type === 'pointerdown') init.buttons = 1;
    target.dispatchEvent(type.startsWith('pointer')
      ? new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true })
      : new MouseEvent(type, init));
  }
}

function hover(el, rect) {
  const { target, x, y } = pointAt(el, rect);
  if (hovered && hovered !== target && hovered.isConnected) {
    dispatchMouse(hovered, ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'], x, y);
  }
  dispatchMouse(target, ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'], x, y);
  hovered = target;
  el.focus({ preventScroll: true }); // menus built on :focus-within open too
}

function focusScrollable(el) {
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1; // focusable, so arrow keys scroll it
  el.focus({ preventScroll: true });
  toast('Panel focused: arrows, Space and PgUp/PgDn now scroll it');
}

// Elements can be re-rendered (feeds do this constantly) between showing hints and picking.
function refind(t) {
  if (!t.unique) return null; // with identical copies around, we can't know which one was meant
  const again = findClickables().filter((c) => signature(c.el, c.text) === t.sig);
  return again.length === 1 ? again[0] : null;
}

function activate(t, mode) {
  if (!t.el.isConnected) {
    t = refind(t);
    if (!t) return toast('The page changed. Press Alt+J again');
  }
  const { el } = t;
  const rect = t.textNode ? t.rect : visibleRect(el) || t.rect; // text starts keep their range rect
  flash(rect);
  if (mode === 'copy') return copyText(t.href, 'Copied link');
  if (mode === 'newtab') return openTab(t.href);
  if (mode === 'focus') return isTextField(el) ? focusField(el) : el.focus();
  if (mode === 'hover') return hover(el, rect);
  if (mode === 'scroll') return focusScrollable(el);
  if (mode === 'text') return startVisual(t.textNode);

  // click
  if (isTextField(el)) return focusField(el);
  if (el.tagName === 'SELECT') {
    el.focus();
    return el.showPicker();
  }
  const { target, x, y } = pointAt(el, rect);
  dispatchMouse(target, ['pointerover', 'mouseover', 'pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'], x, y);
  if (el.isConnected) el.focus({ preventScroll: true });
}

// ---------- text selection ("caret" then "visual" like Vim) ----------

const MOVES = {
  h: ['backward', 'character'], l: ['forward', 'character'],
  j: ['forward', 'line'], k: ['backward', 'line'],
  w: ['forward', 'word'], e: ['forward', 'word'], b: ['backward', 'word'],
  0: ['backward', 'lineboundary'], $: ['forward', 'lineboundary'],
  '(': ['backward', 'sentence'], ')': ['forward', 'sentence'],
  '{': ['backward', 'paragraph'], '}': ['forward', 'paragraph'],
};

function startVisual(node) {
  const sel = getSelection();
  const range = document.createRange();
  range.setStart(node, Math.max(0, node.data.search(/\S/)));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  const { host, root } = createHost();
  const bar = document.createElement('div');
  bar.className = 'bar';
  root.appendChild(bar);
  setState({ phase: 'selecting', selection: 'caret', host, bar });
  caretBlock();
  renderVisualBar();
}

// A one-character selection shows where the caret is on non-editable text.
function caretBlock() {
  getSelection().modify('extend', 'forward', 'character');
}

function renderVisualBar() {
  const extending = state.selection === 'extending';
  renderBar(state.bar, extending ? 'SELECTING' : 'CARET', [
    ['h j k l', 'move'], ['w b', 'word'], ['0 $', 'line'],
    ['v', extending ? 'stop selecting' : 'start selecting', extending], ['y', 'copy'], ['Esc', 'exit'],
  ]);
}

function scrollSelectionIntoView(sel) {
  const r = document.createRange();
  r.setStart(sel.focusNode, sel.focusOffset);
  const rect = r.getBoundingClientRect();
  if (!rect.height) return;
  if (rect.bottom > innerHeight - 60) scrollBy(0, rect.bottom - innerHeight + 120);
  else if (rect.top < 0) scrollBy(0, rect.top - 60);
}

function visualKey(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return setState({ phase: 'idle', keepSelection: true }); // e.g. Ctrl+C copies it natively
  e.preventDefault();
  e.stopImmediatePropagation();
  const sel = getSelection();
  if (e.key === 'Escape') return setState(IDLE);
  if (e.key === 'y') {
    const text = sel.toString();
    setState(IDLE);
    return copyText(text, 'Copied');
  }
  if (e.key === 'v') { // caret <-> extending
    if (state.selection === 'extending') { sel.collapseToEnd(); caretBlock(); } else sel.collapseToStart();
    state.selection = state.selection === 'extending' ? 'caret' : 'extending';
    return renderVisualBar();
  }
  const move = MOVES[e.key];
  if (!move) return;
  if (state.selection === 'extending') sel.modify('extend', ...move);
  else {
    sel.collapseToStart();
    sel.modify('move', ...move);
    caretBlock();
  }
  scrollSelectionIntoView(sel);
}

// ---------- iframes ----------
// Child frames find their own targets; the top frame hands out labels and reads the keys.

let frameVisible = true;
if (!IS_TOP) {
  // With no root, this tracks visibility in the top-level viewport (works cross-origin too).
  new IntersectionObserver(([entry]) => { frameVisible = entry.isIntersecting; }).observe(document.documentElement);
}

// Child frame side. status: 'collected' (targets found) -> 'showing' (hints drawn) -> 'hidden'.
// Targets are kept while hidden, because an activation can arrive right after the stop.
const CHILD_TRANSITIONS = { collected: ['showing', 'hidden'], showing: ['hidden'], hidden: [] };
let child = null; // { status, nonce, targets, hints, host }

function setChildStatus(status) {
  if (!CHILD_TRANSITIONS[child.status].includes(status)) {
    throw new Error(`KeyHints: no child-frame transition ${child.status} -> ${status}`);
  }
  child.status = status;
}

// Top side: ask visible child frames for their targets while `starting` is the current state.
function collectFrames(starting) {
  const iframes = [...document.querySelectorAll('iframe, frame')].filter((f) => inViewport(f.getBoundingClientRect()));
  const nonce = Math.random().toString(36).slice(2);
  if (iframes.length === 0) return { nonce, remote: [] };
  return new Promise((resolve) => {
    const remote = [];
    let replies = 0;
    const done = () => { clearTimeout(timer); starting.collector = null; resolve({ nonce, remote }); };
    const timer = setTimeout(done, 150); // frames that are still loading are skipped
    starting.collector = {
      nonce,
      add(frameId, items) {
        items.forEach((item, index) => remote.push({ ...item, frameId, index }));
        if (++replies >= iframes.length) done();
      },
    };
    toFrames({ type: 'frame-collect', nonce });
  });
}

function childCollect({ nonce }) {
  if (child && child.status === 'showing') childStop();
  const targets = frameVisible ? findClickables() : [];
  child = { status: 'collected', nonce, targets, hints: [], host: null };
  toTop({ type: 'frame-targets', nonce, items: targets.map((t) => ({ isLink: t.isLink, text: t.text, href: t.href })) });
}

function childShow({ nonce, labels }) {
  if (!child || child.nonce !== nonce) return;
  setChildStatus('showing');
  const { host, root } = createHost();
  child.host = host;
  child.hints = child.targets.map((t, i) => ({ label: labels[i], rect: t.rect, node: makeHintNode(root, t.rect) }));
  for (const h of child.hints) setHintText(h.node, h.label, '');
  layoutHints(child.hints);
}

function childRender({ nonce, typed, show, used }) {
  if (!child || child.nonce !== nonce || child.status !== 'showing') return;
  for (const h of child.hints) {
    const visible = show.includes(h.label);
    h.node.classList.toggle('hidden', !visible);
    h.node.classList.toggle('used', used.includes(h.label));
    if (visible) setHintText(h.node, h.label, typed);
  }
}

function childStop() {
  if (!child || child.status === 'hidden') return;
  if (child.status === 'showing') child.host.remove();
  setChildStatus('hidden');
  child.host = null;
  child.hints = [];
}

function childActivate({ nonce, index, mode }) {
  if (!child || child.nonce !== nonce) return;
  activate(child.targets[index], mode);
}

// ---------- per-site switch (toolbar button) ----------

function reportSiteState() {
  if (IS_TOP) chrome.runtime.sendMessage({ type: 'site-state', disabled: siteDisabled() });
}

function onSettingsChanged() {
  reportSiteState();
}

async function toggleSite() {
  const host = location.hostname;
  const off = !siteDisabled();
  let { disabledSites, enabledSites } = settings;
  if (off) { // turning single keys off here
    if (enabledSites.includes(host)) enabledSites = enabledSites.filter((h) => h !== host); // back to the built-in default
    else disabledSites = [...disabledSites, host];
  } else {
    disabledSites = disabledSites.filter((h) => h !== host);
    if (hasOwnKeys(host)) enabledSites = [...enabledSites, host];
  }
  await chrome.storage.local.set({ settings: { ...settings, disabledSites, enabledSites } });
  toast(off ? `Single-key shortcuts off on ${host} (Alt+J still works)` : `Single-key shortcuts on for ${host}`);
}

ready.then(reportSiteState);

// ---------- keys and messages ----------

addEventListener('keydown', (e) => {
  if (!settings) return; // storage not read yet (first moments of page load)
  switch (state.phase) {
    case 'selecting': return visualKey(e);
    case 'hinting': return handleHintKey(e);
    case 'starting':
      // A browser/page shortcut cancels the hints that are still on their way, and goes through.
      if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab') return setState(IDLE);
      e.preventDefault();
      e.stopImmediatePropagation();
      return state.queued.push(e);
    case 'prefix': {
      const { key, expiresAt } = state;
      setState(IDLE);
      if (Date.now() < expiresAt && !e.ctrlKey && !e.altKey && !e.metaKey && !isTyping(e)) {
        const second = key === 'y' ? e.key === 'f' : e.key === key; // yf, ]] or [[
        if (second) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return key === 'y' ? start('copy') : followPageLink(key === ']' ? 1 : -1); // sites.js
        }
      }
      return idleKey(e);
    }
    case 'idle': return idleKey(e);
    case 'help': return helpKey(e); // help.js
    case 'passkey': return passKeyKey(e);
    case 'items': return itemKey(e); // items.js
    case 'palette': return paletteKey(e); // palette.js
  }
}, true);

let undoUntil = 0; // "u" undoes a new single key for a few seconds after its toast

function idleKey(e) {
  // Keys this site keeps for itself never reach KeyHints here (palette: "Leave a key to this site").
  if (!e.ctrlKey && !e.altKey && !e.metaKey && sitePassKeys().includes(e.key)) return;
  if (videoKey(e)) return; // video.js: YouTube / Netflix controls (work even where bare f is the site's)
  // Ctrl+Left / Ctrl+Right: previous / next tab, like Ctrl+Shift+Tab / Ctrl+Tab. In a text field they keep moving by word.
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isTyping(e)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return chrome.runtime.sendMessage({ type: e.key === 'ArrowRight' ? 'next-tab' : 'prev-tab' });
  }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || siteDisabled()) return;
  if (siteKey(e)) return; // sites.js: GitHub pull request / Jira keys
  const consume = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (e.key === 'f') { consume(); start('click'); }
  else if (e.key === 'F') { consume(); start('newtab'); }
  else if (e.key === ';') { consume(); start('focus'); }
  else if (e.key === '`') { consume(); lastTab(); }
  else if (e.key === '?') { consume(); startHelp(); } // help.js
  else if (e.key === 'u' && Date.now() < undoUntil) { consume(); undoNewKey(); }
  // Not consumed: sites may use plain "y", "]" or "[".
  else if (e.key === 'y' || e.key === ']' || e.key === '[') setState({ phase: 'prefix', key: e.key, expiresAt: Date.now() + 1000 });
}

async function undoNewKey() {
  undoUntil = 0;
  const undone = await undoPromotion(); // store.js
  toast(undone ? `Undone: ${undone.text || 'that element'} no longer has ${undone.key.toUpperCase()}` : 'No new single key to undo here');
}

// "Leave a key to this site": the next key pressed is given to the site, or taken back.
function startPassKey() {
  const { host, root } = createHost();
  const bar = document.createElement('div');
  bar.className = 'bar';
  root.appendChild(bar);
  const kept = sitePassKeys();
  renderBar(bar, 'LEAVE A KEY', [[`press the key ${location.hostname} should keep${kept.length ? ` (keeps: ${kept.join(' ')}; press one again to take it back)` : ''}`], ['Esc', 'cancel']]);
  setState({ phase: 'passkey', host });
}

async function passKeyKey(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') return setState(IDLE);
  if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return; // a single key, no modifiers
  setState(IDLE);
  const keeps = await togglePassKey(e.key);
  toast(keeps ? `${location.hostname} keeps ${e.key} now; every other KeyHints key still works here`
    : `${e.key} is KeyHints' again on ${location.hostname}`);
}

// Back to the tab used before this one (the background script keeps the order per window).
async function lastTab() {
  const res = await chrome.runtime.sendMessage({ type: 'last-tab' });
  if (!res.ok) toast(res.error);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  sendResponse({ ok: true });
  ready.then(() => handleMessage(msg));
});

function handleMessage(msg) {
  switch (msg.type) {
    case 'toggle-hints':
      if (state.phase === 'idle' || state.phase === 'prefix') start('click');
      else setState(IDLE);
      break;
    case 'toggle-site': toggleSite(); break;
    case 'open-palette': // Alt+K
      if (state.phase === 'palette') setState(IDLE);
      else { if (state.phase !== 'idle') setState(IDLE); startPalette(); }
      break;
    case 'item-mode': // Alt+I
      if (state.phase === 'items') setState(IDLE);
      else { if (state.phase !== 'idle') setState(IDLE); startItems(); }
      break;
    case 'start-request': if (IS_TOP) start(msg.mode); break;
    case 'frame-targets':
      if (IS_TOP && state.phase === 'starting' && state.collector && msg.nonce === state.collector.nonce) {
        state.collector.add(msg.fromFrame, msg.items);
      }
      break;
    case 'frame-collect': if (!IS_TOP) childCollect(msg); break;
    case 'frame-show': if (!IS_TOP) childShow(msg); break;
    case 'frame-render': if (!IS_TOP) childRender(msg); break;
    case 'frame-activate': if (!IS_TOP) childActivate(msg); break;
    case 'frame-stop': if (!IS_TOP) childStop(); break;
  }
}
