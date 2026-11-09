// What KeyHints keeps in chrome.storage.local, and under which keys. Only the background script
// writes it (content scripts and pages ask it to); everyone may read.
//
//   schema          number   version of everything below; other data is wiped when it changes
//   settings        Settings
//   settingsAt      number   when settings last changed (sync: the newer side wins)
//   labels:<host>   Memory   saved labels for one site
//   learned:<host>  string[] CSS selectors learned from mouse clicks on one site
//   undo:<host>     Undo     the last new single key on one site, so it can be taken back
//   tipsSeen        string[] one-time tips already shown

export const SCHEMA = 2;

export const labelsKey = (host: string) => `labels:${host}`;
export const learnedKey = (host: string) => `learned:${host}`;
export const undoKey = (host: string) => `undo:${host}`;
export const LABELS_PREFIX = 'labels:';
export const LEARNED_PREFIX = 'learned:';

// One saved label. `id` (the key in Memory) identifies the element: see core/identity.ts.
export interface MemoryEntry {
  label: string;
  name: string; // the element's readable name, for the "?" sheet and settings
  used: number; // last pick (ms)
  uses: number; // picks
  pinned?: boolean; // chosen with "!": never moved, forgotten or taken
  pinAt?: number; // when it was pinned or unpinned (sync: the newer side wins)
  since?: number; // when it got its single key or pin, for "new this week"
}
export type Memory = Record<string, MemoryEntry>;

export interface Undo {
  before: Memory;
  key: string;
  name: string;
}

export const MAX_REMEMBERED = 300; // per site; least recently used are forgotten first
export const MAX_LEARNED = 50; // learned click selectors per site
