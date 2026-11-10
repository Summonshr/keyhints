// Iframes: child frames find their own targets and draw their own hints; the top frame hands out
// the labels and reads the keys. Messages go through the background (frames can't reach each other).

import type { ModeId } from '../core/modes';
import { call, type FrameMessage, type PageMessage } from '../shared/messages';
import { createHost, layoutHints, makeHintNode, setHintText } from '../dom/overlay';
import { findClickables, inViewport, type Target } from '../dom/targets';
import { activate } from './activate';
import { isLearned } from './store';
import type { Hint } from './hints';
import { state, type StateOf } from './state';

export const IS_TOP = window === window.top;
const toTop = (payload: FrameMessage) => call('to-top', { payload });
const toFrames = (payload: FrameMessage, frameId?: number) => call('to-frames', { payload, frameId });

// A child frame's f / Alt+J: the top frame runs the session.
export const requestStart = (mode: ModeId) => toTop({ type: 'start-request', mode });

type RemoteItem = { isLink: boolean; text: string; href: string | null; frameId: number; index: number };

// Top side: ask visible child frames for their targets while `starting` is the current state.
export function collectFrames(starting: StateOf<'starting'>): Promise<{ nonce: string; remote: RemoteItem[] }> {
  const iframes = [...document.querySelectorAll('iframe, frame')].filter((f) => inViewport(f.getBoundingClientRect()));
  const nonce = Math.random().toString(36).slice(2);
  if (iframes.length === 0) return Promise.resolve({ nonce, remote: [] });
  return new Promise((resolve) => {
    const remote: RemoteItem[] = [];
    let replies = 0;
    const done = () => { clearTimeout(timer); starting.collector = null; resolve({ nonce, remote }); };
    const timer = setTimeout(done, 150); // frames that are still loading are skipped
    starting.collector = {
      nonce,
      add(frameId, items, expected) {
        items.forEach((item, index) => remote.push({ ...item, frameId, index }));
        // Every frame in the tab answers (hidden and nested ones too); only the visible child
        // frames counted above end the wait.
        if (expected && ++replies >= iframes.length) done();
      },
    };
    toFrames({ type: 'frame-collect', nonce });
  });
}

export function framesShow(nonce: string, frames: number[], hints: Hint[]) {
  for (const frameId of frames) {
    toFrames({ type: 'frame-show', nonce, labels: hints.filter((h) => h.frameId === frameId).map((h) => h.label) }, frameId);
  }
}

export function framesRender(s: StateOf<'hinting'>, shown: Set<Hint>) {
  for (const frameId of s.frames) {
    const mine = s.hints.filter((h) => h.frameId === frameId);
    toFrames({
      type: 'frame-render', nonce: s.nonce, typed: s.typed,
      show: mine.filter((h) => shown.has(h)).map((h) => h.label),
      used: mine.filter((h) => h.used).map((h) => h.label),
    }, frameId);
  }
}

export const framesStop = () => toFrames({ type: 'frame-stop' });
export const frameActivate = (nonce: string, frameId: number, index: number, mode: ModeId) =>
  toFrames({ type: 'frame-activate', nonce, index, mode }, frameId);

// ---------- child frame side ----------

let frameVisible = true;
if (!IS_TOP) {
  // With no root, this tracks visibility in the top-level viewport (works cross-origin too).
  new IntersectionObserver(([entry]) => { frameVisible = entry.isIntersecting; }).observe(document.documentElement);
}

// status: collected (targets found) -> showing (hints drawn) -> hidden. Targets are kept while
// hidden, because an activation can arrive right after the stop.
type ChildStatus = 'collected' | 'showing' | 'hidden';
const CHILD_TRANSITIONS: Record<ChildStatus, ChildStatus[]> = { collected: ['showing', 'hidden'], showing: ['hidden'], hidden: [] };
let child: { status: ChildStatus; nonce: string; targets: Target[]; hints: { label: string; rect: DOMRect; node: HTMLElement }[]; host: HTMLElement | null } | null = null;

function setChildStatus(status: ChildStatus) {
  if (!CHILD_TRANSITIONS[child!.status].includes(status)) throw new Error(`KeyHints: no child-frame transition ${child!.status} -> ${status}`);
  child!.status = status;
}

function childStop() {
  if (!child || child.status === 'hidden') return;
  if (child.status === 'showing') child.host!.remove();
  setChildStatus('hidden');
  child.host = null;
  child.hints = [];
}

// Frame messages, in whichever frame they arrive. Returns true if it was one.
export function handleFrameMessage(msg: PageMessage): boolean {
  switch (msg.type) {
    case 'frame-targets':
      if (IS_TOP && state.phase === 'starting' && state.collector && msg.nonce === state.collector.nonce) {
        state.collector.add(msg.fromFrame!, msg.items, msg.expected);
      }
      return true;
    case 'frame-collect': {
      if (IS_TOP) return true;
      if (child && child.status === 'showing') childStop();
      const targets = frameVisible ? findClickables(isLearned) : [];
      child = { status: 'collected', nonce: msg.nonce, targets, hints: [], host: null };
      toTop({
        type: 'frame-targets', nonce: msg.nonce, expected: frameVisible && parent === top,
        items: targets.map((t) => ({ isLink: t.isLink, text: t.text, href: t.href })),
      });
      return true;
    }
    case 'frame-show': {
      if (IS_TOP || !child || child.nonce !== msg.nonce) return true;
      setChildStatus('showing');
      const { host, root } = createHost();
      child.host = host;
      child.hints = child.targets.map((t, i) => ({ label: msg.labels[i], rect: t.rect, node: makeHintNode(root, t.rect) }));
      for (const h of child.hints) setHintText(h.node, h.label, '');
      layoutHints(child.hints);
      return true;
    }
    case 'frame-render':
      if (IS_TOP || !child || child.nonce !== msg.nonce || child.status !== 'showing') return true;
      for (const h of child.hints) {
        const visible = msg.show.includes(h.label);
        h.node.classList.toggle('hidden', !visible);
        h.node.classList.toggle('used', msg.used.includes(h.label));
        if (visible) setHintText(h.node, h.label, msg.typed);
      }
      return true;
    case 'frame-activate':
      if (!IS_TOP && child && child.nonce === msg.nonce) activate(child.targets[msg.index], msg.mode as ModeId);
      return true;
    case 'frame-stop':
      if (!IS_TOP) childStop();
      return true;
    default:
      return false;
  }
}
