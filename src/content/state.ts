// The page's one state machine: exactly one phase at a time, changed only through setState().
//
//   idle ──y / ] / [──▶ prefix ──f / ] / [──▶ starting (yf) or idle (]] [[ follow the page link)
//                        └─other key─▶ idle
//   starting ──hints ready──▶ hinting ──pick/Esc──▶ idle
//                                          │                 │
//                                          └─cancel─▶ idle   └─Shift+X / Shift+Z─▶ starting
//   idle ──text pick──▶ selecting ──y/Esc──▶ idle
//   idle ──Alt+I──▶ items ──f──▶ starting (hints inside the highlighted post)
//   idle ──Alt+K──▶ palette ──Enter──▶ idle (or starting / items, if the command does that)
//   idle ──?──▶ help ──any key──▶ idle
//   idle ──palette "leave a key"──▶ passkey ──key──▶ idle

import type { ModeId } from '../core/modes';
import type { Hint } from './hints';
import type { PaletteState } from './palette';

export interface Collector { nonce: string; add(frameId: number, items: { isLink: boolean; text: string; href: string | null }[], expected: boolean): void }
export type FilterState = { status: 'off' | 'typing' | 'applied'; text: string };
export type PinState = { step: 'none' } | { step: 'element' } | { step: 'key'; hint: Hint };

export type State =
  | { phase: 'idle'; keepSelection?: boolean }
  | { phase: 'prefix'; key: string; expiresAt: number }
  | { phase: 'starting'; mode: ModeId; scope: Element | null; queued: KeyboardEvent[]; collector: Collector | null }
  | { phase: 'hinting'; mode: ModeId; hints: Hint[]; typed: string; filter: FilterState; pin: PinState;
      host: HTMLElement; bar: HTMLElement; nonce: string; frames: number[] }
  | { phase: 'selecting'; selection: 'caret' | 'extending'; host: HTMLElement; bar: HTMLElement }
  | { phase: 'items'; current: Element; host: HTMLElement; ring: HTMLElement; chip: HTMLElement; bar: HTMLElement }
  | PaletteState
  | { phase: 'help'; host: HTMLElement }
  | { phase: 'passkey'; host: HTMLElement };

export type Phase = State['phase'];
export type StateOf<P extends Phase> = Extract<State, { phase: P }>;

const TRANSITIONS: Record<Phase, Phase[]> = {
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

export const IDLE: State = { phase: 'idle' };
export let state: State = IDLE;

// What each phase needs undone when it ends (registered by the module that owns the phase).
const leaving: Partial<Record<Phase, (prev: State, next: State) => void>> = {};
const entering: Partial<Record<Phase, (next: State) => void>> = {};
export function onLeave<P extends Phase>(phase: P, fn: (prev: StateOf<P>, next: State) => void) {
  leaving[phase] = fn as (prev: State, next: State) => void;
}
export function onEnter<P extends Phase>(phase: P, fn: (next: StateOf<P>) => void) {
  entering[phase] = fn as (next: State) => void;
}

export function setState(next: State) {
  if (!TRANSITIONS[state.phase].includes(next.phase)) {
    throw new Error(`KeyHints: no transition ${state.phase} -> ${next.phase}`);
  }
  const prev = state;
  state = next;
  leaving[prev.phase]?.(prev, next);
  entering[next.phase]?.(next);
}

// The current state, if it is in `phase` (narrowed), else null.
export function inPhase<P extends Phase>(phase: P): StateOf<P> | null {
  return state.phase === phase ? (state as StateOf<P>) : null;
}
