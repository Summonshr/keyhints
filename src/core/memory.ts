// Saved labels per site: remembering picks, earning single keys, pinning, undo, and fitting the
// labels on screen. Pure: every function returns new data; the background script saves it.

import { MAX_REMEMBERED, type Memory, type MemoryEntry, type Undo } from '../shared/storage';
import { makeLabels, nameWords, neededLength, textLabels } from './labels';

export const PROMOTE_AFTER = 3; // picks before an element earns a single-key label
const usesOf = (e: MemoryEntry) => e.uses || 1;
const clone = (m: Memory): Memory => structuredClone(m);

// Keeps the stored set prefix-free and bounded: pinned first (your explicit choice wins any clash),
// then the most recently used. Two tabs can save at nearly the same moment; this settles clashes.
export function sanitize(stored: Memory | undefined): Memory {
  const kept: Memory = {};
  const entries = Object.entries(stored || {})
    .sort((a, b) => Number(!!b[1].pinned) - Number(!!a[1].pinned) || b[1].used - a[1].used);
  for (const [id, entry] of entries.slice(0, MAX_REMEMBERED)) {
    const clash = Object.values(kept).some((k) => k.label.startsWith(entry.label) || entry.label.startsWith(k.label));
    if (!clash) kept[id] = entry;
  }
  return kept;
}

// First letters of the words in a name, in order: "Notifications" -> n, "Creator Studio" -> c, s.
export function initials(name: string): string[] {
  return [...new Set(nameWords(name).map((w) => w[0]))];
}

// Frequently picked elements get a single key, the first letter of their name when it can be had
// (H for Home). A key can be had if no saved label starts with it, or if every saved label starting
// with it is a longer label picked less often; those are forgotten (they get new labels next time).
// A single key someone already learned is never taken by another element. An element whose single
// key isn't its initial moves to its initial once it can. Without a usable initial, alphabet keys
// are tried, cheapest first. Mutates `memory`; returns the new key or null.
function promote(memory: Memory, id: string, alphabet: string, now: number): string | null {
  const entry = memory[id];
  if (entry.pinned || usesOf(entry) < PROMOTE_AFTER) return null;
  const wanted = initials(entry.name);
  if (entry.label.length === 1 && (wanted.includes(entry.label) || !wanted.length)) return null;
  const takeable = (key: string) => {
    const owners = Object.keys(memory).filter((s) => s !== id && memory[s].label.startsWith(key));
    if (owners.some((s) => memory[s].pinned || memory[s].label.length === 1 || usesOf(memory[s]) >= usesOf(entry))) return null;
    return { key, owners, cost: owners.reduce((sum, s) => sum + usesOf(memory[s]), 0) };
  };
  let best = wanted.map(takeable).find(Boolean) || null;
  if (!best && entry.label.length === 1) return null; // keep the single key it has
  if (!best) {
    for (const key of alphabet) {
      const option = takeable(key);
      if (option && (!best || option.cost < best.cost)) best = option;
      if (best && best.cost === 0) break;
    }
  }
  if (!best) return null;
  for (const s of best.owners) delete memory[s];
  entry.label = best.key;
  entry.since = now;
  return best.key;
}

// Records a pick. The first pick saves the label; later picks only count (another copy of an
// identical element may have been picked under a different label). Returns the new memory, and the
// new single key (with what to restore for undo) if this pick earned one.
export function remember(memory: Memory, id: string, label: string, name: string, alphabet: string, now: number):
  { memory: Memory; promoted: string | null; undo: Undo | null } {
  const before = clone(memory);
  const next = clone(memory);
  const entry = next[id];
  if (entry) {
    entry.used = now;
    entry.uses = usesOf(entry) + 1;
    entry.name = name || entry.name;
  } else {
    next[id] = { label, name, used: now, uses: 1 };
  }
  const promoted = promote(next, id, alphabet, now);
  return { memory: sanitize(next), promoted, undo: promoted ? { before, key: promoted, name } : null };
}

// You chose `key` for this element: it keeps it for good. Saved labels in the way are forgotten.
export function pin(memory: Memory, id: string, key: string, name: string, now: number): Memory {
  const next = clone(memory);
  for (const s of Object.keys(next)) {
    if (s !== id && (next[s].label.startsWith(key) || key.startsWith(next[s].label))) delete next[s];
  }
  const entry = next[id];
  next[id] = { label: key, name: name || entry?.name || '', used: now, uses: entry ? usesOf(entry) : 1, pinned: true, pinAt: now, since: now };
  return sanitize(next);
}

// Another computer unpinned it: it stays saved, but is an ordinary label again.
export function unpin(memory: Memory, id: string, now: number): Memory {
  if (!memory[id]?.pinned) return memory;
  const next = clone(memory);
  next[id] = { ...next[id], pinned: false, pinAt: now };
  return next;
}

export interface LabelTarget {
  id: string | null; // identity key, or null for throwaway hints (text selection, other frames)
  name: string;
  centre: number; // distance from the middle of the screen
}

export interface Assigned {
  local: { label: string; id: string | null; unique: boolean }[];
  extra: string[]; // labels for hints in child frames
  forgot: string[]; // saved labels dropped to keep labels short (to be forgotten in storage)
}

// Remembered labels for elements seen before, labels from text where they can be had, generated ones
// for the rest (and `extra` generated labels for hints in child frames). When identical elements are
// on screen (every post's Like button), the remembered label goes to the copy nearest the centre.
// If that would push labels to three keys when two would do: one-key labels from text are dropped
// first, then all labels from text, then the least used, then least recent, memories are forgotten.
export function assignLabels(targets: LabelTarget[], memory: Memory, opts: { alphabet: string; useMemory: boolean; extra?: number }): Assigned {
  const { alphabet, useMemory, extra = 0 } = opts;
  const mem = clone(memory);
  const ids = targets.map((t) => (useMemory ? t.id : null));
  const owner = new Map<string, number>(); // id -> index of the copy that gets the remembered label
  const copies = new Map<string, number>();
  ids.forEach((id, i) => {
    if (!id) return;
    copies.set(id, (copies.get(id) || 0) + 1);
    const o = owner.get(id);
    if (o === undefined || targets[i].centre < targets[o].centre) owner.set(id, i);
  });
  const maxLength = Math.max(2, neededLength(targets.length + extra, alphabet));
  const fits = (fresh: string[] | null): fresh is string[] => !!fresh && fresh.every((l) => l.length <= maxLength);
  const forgot: string[] = [];

  for (;;) {
    const labels = ids.map((id, i) => (id && owner.get(id) === i && mem[id] ? mem[id].label : null));
    const reserved = new Set(Object.values(mem).map((e) => e.label));
    const unlabelled = labels.flatMap((l, i) => (l ? [] : [i]));
    let named = new Map<number, string>();
    let fresh: string[] | null = null;
    for (const singles of useMemory ? [true, false] : []) {
      named = textLabels(targets.map((t) => t.name), unlabelled, reserved, singles);
      fresh = makeLabels(unlabelled.length - named.size + extra, new Set([...reserved, ...named.values()]), alphabet);
      if (fits(fresh)) break;
    }
    if (!fits(fresh)) {
      named = new Map();
      fresh = makeLabels(unlabelled.length + extra, reserved, alphabet);
    }
    // Throwaway hints (text selection) may go long instead of costing remembered labels, and
    // pinned labels are never forgotten: if only those are left, labels may go long too.
    const forgettable = Object.entries(mem).filter(([, e]) => !e.pinned);
    if (fresh && (!useMemory || !forgettable.length || fits(fresh))) {
      const pool = fresh;
      const local = labels.map((l, i) => ({
        label: l || named.get(i) || pool.shift()!,
        id: ids[i],
        unique: !!ids[i] && copies.get(ids[i]!) === 1,
      }));
      return { local, extra: pool, forgot };
    }
    if (!forgettable.length) throw new Error('KeyHints: pinned labels block every label');
    const [weakest] = forgettable.sort((a, b) => usesOf(a[1]) - usesOf(b[1]) || a[1].used - b[1].used)[0];
    delete mem[weakest];
    forgot.push(weakest);
  }
}

// Learned keys on a site, for the "?" sheet: single keys and pinned keys.
export function learnedKeys(memory: Memory) {
  return Object.values(memory)
    .filter((e) => e.label.length === 1 || e.pinned)
    .map((e) => ({ key: e.label, name: e.name, pinned: !!e.pinned, uses: usesOf(e), since: e.since || 0 }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// For the "?" sheet: keys the site gave you in the last 7 days, and the 5 most picked elements.
export function weekSummary(memory: Memory, now: number) {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const top = Object.values(memory)
    .filter((e) => usesOf(e) >= 2)
    .sort((a, b) => usesOf(b) - usesOf(a))
    .slice(0, 5)
    .map((e) => ({ key: e.label, name: e.name, uses: usesOf(e) }));
  return { learned: learnedKeys(memory).filter((k) => k.since >= weekAgo), top };
}

// Saved labels that use a letter no longer in the alphabet are forgotten (a label taken from a name
// is simply taken again next time); single keys may be any letter, so they stay. Returns the kept
// memory and how many were dropped.
export function keepFitting(memory: Memory, alphabet: string): { memory: Memory; dropped: number } {
  const kept: Memory = {};
  let dropped = 0;
  for (const [id, e] of Object.entries(memory)) {
    if (e.label.length === 1 || [...e.label].every((c) => alphabet.includes(c))) kept[id] = e;
    else dropped++;
  }
  return { memory: kept, dropped };
}
