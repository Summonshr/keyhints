// Messages between pages (content scripts, settings, welcome) and the background script, typed.
// The background script is the only writer of storage: everything that changes saved data is a
// request here, run there one at a time per storage key.

import type { Memory, Undo } from './storage';
import type { Settings } from './settings';

export interface PaletteData {
  searchAllowed: boolean;
  groups: { id: number; title: string }[];
  tabs: { id: number; windowId: number; title: string; url: string }[];
  closed: { sessionId: string; title: string; url: string }[];
  bookmarks: { title: string; url: string }[];
  history: { title: string; url: string }[];
}

export interface Backup {
  keyhints: 2;
  labels: Record<string, Memory>; // "labels:<host>" -> memory
  learned?: Record<string, string[]>; // "learned:<host>" -> selectors
  settings?: Partial<Settings>;
}

type Ok = { ok: true; message?: string };

// type -> [arguments, answer]
export interface Api {
  // saved labels
  remember: [{ host: string; id: string; label: string; name: string }, { promoted: string | null }];
  pin: [{ host: string; id: string; key: string; name: string }, Ok];
  'forget-labels': [{ host: string; ids: string[] }, Ok];
  'undo-promotion': [{ host: string }, { undone: Pick<Undo, 'key' | 'name'> | null }];
  'forget-site': [{ host: string }, Ok];
  'forget-all': [Record<string, never>, Ok];
  'set-alphabet': [{ alphabet: string }, { dropped: number }];
  import: [{ data: Backup }, Ok];
  // settings
  'settings-patch': [{ patch: Partial<Settings> }, Ok];
  'toggle-site': [{ host: string }, { off: boolean }];
  'toggle-pass-key': [{ host: string; key: string }, { keeps: boolean }];
  // learned clicks, tips
  'learn-add': [{ host: string; selector: string }, { added: boolean }];
  'learn-forget': [{ host: string }, { count: number }];
  'tip-once': [{ id: string }, { show: boolean }];
  'tips-reset': [Record<string, never>, Ok];
  // tabs and windows
  'next-tab': [Record<string, never>, Ok];
  'prev-tab': [Record<string, never>, Ok];
  'last-tab': [Record<string, never>, Ok | { ok: false; message: string }];
  'new-tab': [Record<string, never>, Ok];
  'close-tab': [Record<string, never>, Ok];
  'mute-tab': [Record<string, never>, Ok];
  'mute-other-tabs': [Record<string, never>, Ok];
  'switch-tab': [{ tabId: number; windowId: number }, Ok];
  'open-url': [{ url: string; background: boolean }, Ok];
  'open-tab': [{ url: string }, Ok];
  'close-tabs': [{ which: 'others' | 'right' | 'duplicates' }, { closed: number }];
  'tab-group': [{ op: 'new' | 'join' | 'leave' | 'collapse-others' | 'next'; groupId?: number }, { ok: boolean; message: string }];
  'tab-action': [{ op: 'duplicate' | 'pin' | 'new-window' }, Ok];
  'reopen-tab': [{ sessionId?: string }, Ok | { ok: false; message: string }];
  capture: [Record<string, never>, { ok: true; dataUrl: string } | { ok: false; error: string }];
  'palette-query': [{ q: string }, PaletteData];
  'open-options': [Record<string, never>, Ok];
  'site-state': [{ disabled: boolean }, Ok];
  // frames of one tab (child frames can't message the top frame directly)
  'to-top': [{ payload: FrameMessage }, Ok];
  'to-frames': [{ payload: FrameMessage; frameId?: number }, Ok];
}
export type ApiType = keyof Api;

// Asks the background script. A request that failed there throws here.
export async function call<K extends ApiType>(type: K, args: Api[K][0] = {} as Api[K][0]): Promise<Api[K][1]> {
  const res = await chrome.runtime.sendMessage({ type, ...args });
  if (res && typeof res === 'object' && 'failed' in res) throw new Error(`KeyHints: ${type} failed: ${res.failed}`);
  return res;
}

// Messages to content scripts: browser shortcuts, the toolbar button, and frame coordination.
export type FrameMessage =
  | { type: 'start-request'; mode: string; fromFrame?: number }
  | { type: 'frame-collect'; nonce: string }
  | { type: 'frame-targets'; nonce: string; items: { isLink: boolean; text: string; href: string | null }[]; fromFrame?: number }
  | { type: 'frame-show'; nonce: string; labels: string[] }
  | { type: 'frame-render'; nonce: string; typed: string; show: string[]; used: string[] }
  | { type: 'frame-activate'; nonce: string; index: number; mode: string }
  | { type: 'frame-stop' };

export type PageMessage =
  | { type: 'toggle-hints' }
  | { type: 'open-palette' }
  | { type: 'item-mode' }
  | { type: 'toggle-site' }
  | FrameMessage;
