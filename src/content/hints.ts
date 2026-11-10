// A hint session: collect targets, label them, read typed keys, pick. The top frame runs every
// session; child frames report their targets and draw their own hints (frames.ts).

import { assignLabels } from '../core/memory';
import { MODES, modeForKey, type ModeId } from '../core/modes';
import { call } from '../shared/messages';
import { createHost, flash, layoutHints, makeBar, makeHintNode, placeBar, renderBar, setHintText, toast, type BarPart } from '../dom/overlay';
import { findClickables, findScrollables, findTextStarts, type Target } from '../dom/targets';
import { elementId, elementName } from '../dom/identity';
import { activate, openTab, copyText, type Pickable } from './activate';
import { collectFrames, frameActivate, framesRender, framesShow, framesStop, IS_TOP, requestStart } from './frames';
import { resultLabels } from './sites';
import { startHelp } from './help';
import { host, isLearned, memory, ready, settings } from './store';
import { IDLE, inPhase, onEnter, onLeave, setState, state, type FilterState, type PinState, type StateOf } from './state';

export interface Hint {
  label: string;
  id: string | null; // identity key (null: not remembered: digits, text starts, other frames)
  unique: boolean;
  text: string;
  href: string | null;
  isLink: boolean;
  node: HTMLElement | null; // null for hints drawn by a child frame
  el?: Element;
  rect?: DOMRect;
  textNode?: Text;
  frameId?: number; // hints in child frames
  index?: number; // ...and their index there
  used?: boolean; // open-several mode: already opened
}

let lastPick: { id: string; mode: ModeId } | null = null; // for "." (repeat)
let undoUntil = 0; // "u" undoes a new single key for a few seconds after its toast
export const undoWindowOpen = () => Date.now() < undoUntil;

// After an await: is this still the page's state? (Esc or a restart may have replaced it.)
const stillCurrent = (s: object) => (state as object) === s;

const centreDistance = (r: DOMRect) => Math.hypot(r.left + r.width / 2 - innerWidth / 2, r.top + r.height / 2 - innerHeight / 2);

function collect(kind: 'clickable' | 'scroll' | 'text', scope: Element | null): Target[] {
  if (kind === 'scroll') return findScrollables();
  if (kind === 'text') return findTextStarts();
  return findClickables(isLearned, scope || undefined);
}

export async function start(mode: ModeId, scope: Element | null = null) {
  await ready;
  if (!IS_TOP) { // the top frame runs every session
    if (state.phase === 'prefix') setState(IDLE);
    return requestStart(mode);
  }
  const starting: StateOf<'starting'> = { phase: 'starting', mode, scope, queued: [], collector: null };
  setState(starting);
  try {
    await showHints(starting);
  } catch (err) { // "starting" takes every key: a failure must not leave the page in it
    if (stillCurrent(starting)) setState(IDLE);
    throw err;
  }
}

async function showHints(starting: StateOf<'starting'>) {
  const { mode, scope } = starting;
  // Keys typed while focus is inside an iframe would never reach this window.
  if (document.activeElement?.tagName === 'IFRAME') (document.activeElement as HTMLElement).blur();

  const { targets, linksOnly } = MODES[mode];
  const local = collect(targets, scope);
  const { nonce, remote } = targets === 'clickable' && !scope ? await collectFrames(starting) : { nonce: '', remote: [] };
  if (!stillCurrent(starting)) return; // cancelled or restarted while waiting for frames
  const usable = (t: { isLink: boolean }) => !linksOnly || t.isLink;
  if (!local.some(usable) && !remote.some(usable)) {
    setState(IDLE);
    toast(linksOnly ? 'No links on screen' : targets === 'scroll' ? 'No scrollable panels on screen' : 'Nothing to pick on screen');
    return;
  }

  // Google results and YouTube video titles get 1–9, 0 (sites.ts); the rest get letters.
  const digits = targets === 'clickable' && !scope ? resultLabels(local) : new Map<Target, string>();
  const lettered = local.filter((t) => !digits.has(t));
  const useMemory = targets !== 'text';
  const assigned = assignLabels(
    lettered.map((t) => ({ id: useMemory ? elementId(t.el, t.text) : null, name: t.text, centre: centreDistance(t.rect) })),
    memory, { alphabet: settings.alphabet, useMemory, extra: remote.length },
  );
  if (assigned.forgot.length) call('forget-labels', { host, ids: assigned.forgot });
  const { host: overlay, root } = createHost();
  const hints: Hint[] = local.map((t) => {
    const a = digits.has(t) ? { label: digits.get(t)!, id: null, unique: false } : assigned.local[lettered.indexOf(t)];
    return { ...t, ...a, node: makeHintNode(root, t.rect) };
  });
  remote.forEach((r, i) => hints.push({ ...r, label: assigned.extra[i], id: null, unique: false, node: null }));
  for (const h of hints) if (h.node) setHintText(h.node, h.label, '');
  layoutHints(hints.filter((h): h is Hint & { node: HTMLElement; rect: DOMRect } => !!h.node));

  const bar = makeBar(root);
  const frames = [...new Set(remote.map((r) => r.frameId))];
  setState({ phase: 'hinting', mode, hints, typed: '', filter: { status: 'off', text: '' }, pin: { step: 'none' }, host: overlay, bar, nonce, frames });
  framesShow(nonce, frames, hints);
  render();

  // Replay keys typed while collecting. A key that restarts (Shift+X, Shift+Z) hands the rest on.
  for (const key of starting.queued) {
    if (state.phase === 'hinting') handleHintKey(key);
    else if (state.phase === 'starting') state.queued.push(key);
  }
}

// Scrolling, resizing or leaving the tab moves things: the hints would point at the wrong places.
const cancelHints = () => { if (state.phase === 'hinting') setState(IDLE); };
onEnter('hinting', () => {
  addEventListener('scroll', cancelHints, { capture: true, passive: true });
  addEventListener('resize', cancelHints);
  document.addEventListener('visibilitychange', cancelHints);
});
onLeave('hinting', (prev) => {
  prev.host.remove();
  if (prev.frames.length) framesStop();
  removeEventListener('scroll', cancelHints, { capture: true });
  removeEventListener('resize', cancelHints);
  document.removeEventListener('visibilitychange', cancelHints);
});

function visibleHints(s: StateOf<'hinting'>, typed = s.typed): Hint[] {
  const { linksOnly } = MODES[s.mode];
  const f = s.filter.text.toLowerCase();
  return s.hints.filter((h) => (!linksOnly || h.isLink) && (!f || h.text.toLowerCase().includes(f)) && h.label.startsWith(typed));
}

function render() {
  const s = inPhase('hinting')!;
  const shown = new Set(visibleHints(s));
  for (const h of s.hints) {
    if (!h.node) continue;
    h.node.classList.toggle('hidden', !shown.has(h));
    h.node.classList.toggle('used', !!h.used);
    if (shown.has(h)) setHintText(h.node, h.label, s.typed);
  }
  framesRender(s, shown);
  const nodes = s.hints.flatMap((h) => (h.node ? [h.node] : []));
  renderSessionBar(s, shown.size, false);
  if (!placeBar(s.bar, nodes)) {
    renderSessionBar(s, shown.size, true); // only the mode name, so it fits somewhere empty
    placeBar(s.bar, nodes);
  }
}

function renderSessionBar(s: StateOf<'hinting'>, count: number, compact: boolean) {
  const mode = MODES[s.mode];
  if (compact) return renderBar(s.bar, s.filter.status === 'typing' ? `/${s.filter.text}` : s.pin.step !== 'none' ? 'PIN' : mode.name, []);
  if (s.pin.step === 'element') return renderBar(s.bar, 'PIN A KEY', [['type the label of the element to pin'], ['Esc', 'cancel']]);
  if (s.pin.step === 'key') return renderBar(s.bar, 'PIN A KEY', [[`press the letter for "${s.pin.hint.text || 'this'}"`], ['Esc', 'cancel']]);
  if (s.filter.status === 'typing') {
    return renderBar(s.bar, 'FILTER', [[` /${s.filter.text}▏ `], [`${count} match${count === 1 ? '' : 'es'}`], ['Enter', 'done'], ['Esc', 'clear']]);
  }
  if (mode.help) return renderBar(s.bar, mode.name, [[mode.help], ['Esc', 'cancel']]);
  const parts: BarPart[] = Object.entries(MODES).filter(([, m]) => m.key).map(([id, m]) => [m.key!, m.name.toLowerCase(), s.mode === id]);
  const applied = s.filter.status === 'applied';
  parts.push(['/', applied ? `filter: ${s.filter.text}` : 'filter', applied], ['.', 'repeat'], ['!', 'pin a key'], ['?', 'all keys']);
  renderBar(s.bar, mode.name, parts);
}

// Filter by text inside a hint session: off -> typing -> applied, with these moves only.
const FILTER_TRANSITIONS: Record<FilterState['status'], FilterState['status'][]> = { off: ['typing'], typing: ['off', 'applied'], applied: ['off', 'typing'] };
function setFilter(s: StateOf<'hinting'>, status: FilterState['status'], text = '') {
  if (!FILTER_TRANSITIONS[s.filter.status].includes(status)) throw new Error(`KeyHints: no filter transition ${s.filter.status} -> ${status}`);
  s.filter = { status, text: status === 'off' ? '' : text };
}

// Pinning a key inside a hint session: none -> element (type its label) -> key (press the letter).
const PIN_TRANSITIONS: Record<PinState['step'], PinState['step'][]> = { none: ['element'], element: ['none', 'key'], key: ['none'] };
function setPin(s: StateOf<'hinting'>, pin: PinState) {
  if (!PIN_TRANSITIONS[s.pin.step].includes(pin.step)) throw new Error(`KeyHints: no pin transition ${s.pin.step} -> ${pin.step}`);
  s.pin = pin;
}

export function handleHintKey(e: KeyboardEvent) {
  // Browser and page shortcuts (Ctrl+L, Ctrl+C, Tab…) cancel hints and go through untouched.
  if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab') return setState(IDLE);
  e.preventDefault();
  e.stopImmediatePropagation();
  const s = inPhase('hinting')!;

  if (s.filter.status === 'typing') {
    if (e.key === 'Escape') { setFilter(s, 'off'); return render(); }
    if (e.key === 'Enter') {
      const matches = visibleHints(s);
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
    if (!/^[a-z]$/.test(key)) return;
    const { hint } = s.pin;
    call('pin', { host, id: hint.id!, key, name: elementName(hint.el!, hint.text) });
    toast(`Pinned: ${hint.text || 'element'} → ${key.toUpperCase()}`);
    return setState(IDLE);
  }

  if (e.key === 'Escape') {
    if (s.pin.step === 'element') { setPin(s, { step: 'none' }); return render(); }
    if (s.filter.status === 'applied') { setFilter(s, 'off'); return render(); }
    return setState(IDLE);
  }
  if (e.key === 'Backspace') { s.typed = s.typed.slice(0, -1); return render(); }
  if (e.key === '/') { setFilter(s, 'typing'); s.typed = ''; return render(); }
  if (e.key === '?') { setState(IDLE); return startHelp(); } // same as "?" outside hint mode
  if (e.key === '.') { setState(IDLE); return repeatLast(); }
  if (e.key === '!') { // the same key again goes back, like the mode keys
    setPin(s, s.pin.step === 'element' ? { step: 'none' } : { step: 'element' });
    s.typed = '';
    return render();
  }

  const wanted = modeForKey(e.key, s.typed);
  if (wanted) {
    const mode = s.mode === wanted ? 'click' : wanted; // the same key again goes back to click
    if (MODES[mode].targets !== MODES[s.mode].targets) return start(mode);
    s.mode = mode;
    s.typed = '';
    return render();
  }
  // Labels are letters (any letter, for labels from text) and digits (search results).
  const key = e.key.toLowerCase();
  if (!/^[a-z0-9]$/.test(key)) return;

  const typed = s.typed + key;
  const matching = visibleHints(s, typed);
  if (matching.length === 0) return; // ignore keys that match nothing
  s.typed = typed;
  const exact = matching.find((h) => h.label === typed);
  if (!exact) return render();
  if (s.pin.step === 'element') {
    s.typed = '';
    if (!exact.id || !exact.el) {
      setPin(s, { step: 'none' });
      toast("That one can't be pinned (it's a numbered result, inside a frame or is text)");
      return render();
    }
    setPin(s, { step: 'key', hint: exact });
    return render();
  }
  pick(exact, e.shiftKey);
}

// "." in hint mode: do the last pick again, on the copy nearest the centre (e.g. like the next post).
export function repeatLast() {
  if (!lastPick) return toast('Nothing to repeat yet');
  const { id, mode } = lastPick;
  const copies = findClickables(isLearned).filter((c) => elementId(c.el, c.text) === id);
  if (!copies.length) return toast('Nothing to repeat here');
  activate(copies.sort((a, b) => centreDistance(a.rect) - centreDistance(b.rect))[0], mode);
}

async function rememberPick(hint: Hint) {
  const { promoted } = await call('remember', { host, id: hint.id!, label: hint.label, name: elementName(hint.el!, hint.text) });
  if (!promoted) return;
  toast(`${hint.text || 'This'} now has its own key: ${promoted.toUpperCase()} (u to undo)`);
  undoUntil = Date.now() + 5000;
}

function pick(hint: Hint, shift: boolean) {
  const s = inPhase('hinting')!;
  let mode = s.mode;
  if (shift && mode === 'click' && hint.isLink) mode = 'newtab'; // Shift on the last letter
  if (hint.id && hint.el) {
    rememberPick(hint);
    lastPick = { id: hint.id, mode: mode === 'multi' ? 'newtab' : mode };
  }
  if (mode === 'multi') { // stay in hint mode; each pick opens another background tab
    openTab(hint.href);
    if (hint.rect && hint.node) flash(hint.rect);
    hint.used = true;
    s.typed = '';
    return render();
  }
  setState(IDLE);
  if (hint.frameId === undefined) return activate(hint as Pickable, mode);
  if (mode === 'copy') return copyText(hint.href, 'Copied link');
  if (mode === 'newtab') return openTab(hint.href);
  frameActivate(s.nonce, hint.frameId, hint.index!, mode);
}

// "u" right after a new single key's toast, or the palette later: takes it back.
export async function undoNewKey() {
  undoUntil = 0;
  const { undone } = await call('undo-promotion', { host });
  toast(undone ? `Undone: ${undone.name || 'that element'} no longer has ${undone.key.toUpperCase()}` : 'No new single key to undo here');
}
