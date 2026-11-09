// Sync between computers (chrome.storage.sync). Pure: the background script moves the data.
//   settings      { value, at }    the whole settings object; the newer side wins
//   pins:<host>   PinMap           one record per pinned element; per element, the newer side wins.
//                                  Unpinning keeps a record (pinned: false), so it travels too.

import type { Memory } from '../shared/storage';
import { pin, unpin } from './memory';

export interface PinRecord { label: string; name: string; pinned: boolean; at: number }
export type PinMap = Record<string, PinRecord>;

// This computer's pin records for a site: every element that was ever pinned or unpinned here.
export function pinsOf(memory: Memory): PinMap {
  const out: PinMap = {};
  for (const [id, e] of Object.entries(memory)) {
    if (e.pinAt !== undefined) out[id] = { label: e.label, name: e.name, pinned: !!e.pinned, at: e.pinAt };
  }
  return out;
}

// Per element, the newer record wins.
export function mergePinMaps(a: PinMap, b: PinMap): PinMap {
  const out: PinMap = { ...a };
  for (const [id, r] of Object.entries(b)) if (!out[id] || r.at > out[id].at) out[id] = r;
  return out;
}

// Applies another computer's records that are newer than this one's. Their time is kept, so the
// result's own records equal the remote ones and nothing is sent back.
export function applyPins(memory: Memory, remote: PinMap): Memory {
  let next = memory;
  for (const [id, r] of Object.entries(remote)) {
    const local = next[id]?.pinAt ?? -1;
    if (r.at <= local) continue;
    next = r.pinned ? pin(next, id, r.label, r.name, r.at) : unpin(next, id, r.at);
  }
  return next;
}

export const samePins = (a: PinMap, b: PinMap) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (m: PinMap) => Object.fromEntries(Object.entries(m).sort(([x], [y]) => x.localeCompare(y)));
