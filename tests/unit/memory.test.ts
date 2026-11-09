import { describe, expect, it } from 'vitest';
import { assignLabels, keepFitting, learnedKeys, pin, remember, sanitize, weekSummary, type LabelTarget } from '../../src/core/memory';
import { isPrefixFree } from '../../src/core/labels';
import type { Memory } from '../../src/shared/storage';

const ALPHA = 'asdfghjklqwertyuiop';
const t = (id: string | null, name: string, centre = 0): LabelTarget => ({ id, name, centre });
const pickTimes = (m: Memory, id: string, label: string, name: string, n: number, start = 1) => {
  let out = { memory: m, promoted: null as string | null };
  for (let i = 0; i < n; i++) out = remember(out.memory, id, label, name, ALPHA, start + i);
  return out;
};

describe('remember and promote', () => {
  it('saves the label on the first pick, counts later ones', () => {
    const { memory } = remember({}, 'x', 'ab', 'Thing', ALPHA, 1);
    expect(memory.x).toMatchObject({ label: 'ab', uses: 1, name: 'Thing' });
    expect(remember(memory, 'x', 'zz', 'Thing', ALPHA, 2).memory.x).toMatchObject({ label: 'ab', uses: 2 });
  });
  it('third pick earns the first letter of the name, with undo', () => {
    const { memory, promoted } = pickTimes({}, 'home', 'ho', 'Home', 3);
    expect(promoted).toBe('h');
    expect(memory.home.label).toBe('h');
    expect(memory.home.since).toBe(3);
    const third = remember(pickTimes({}, 'home', 'ho', 'Home', 2).memory, 'home', 'ho', 'Home', ALPHA, 3);
    expect(third.undo?.before.home.label).toBe('ho');
  });
  it('a learned single key is never taken by a more used element', () => {
    let m = pickTimes({}, 'home', 'ho', 'Home', 3).memory;
    m = pickTimes(m, 'help', 'qw', 'Help', 6, 10).memory; // Help can't have had a label starting with h
    expect(m.home.label).toBe('h');
    expect(m.help.label).not.toBe('h');
  });
  it('moves an old single key to its initial once free', () => {
    const m: Memory = { home: { label: 't', name: 'Home', used: 1, uses: 5 } };
    const { promoted, memory } = remember(m, 'home', 't', 'Home', ALPHA, 2);
    expect(promoted).toBe('h');
    expect(memory.home.label).toBe('h');
  });
});

describe('pin and sanitize', () => {
  it('pinning clears saved labels in the way and wins clashes', () => {
    const m: Memory = { a: { label: 'qa', name: 'A', used: 5, uses: 1 }, b: { label: 'x', name: 'B', used: 1, uses: 1 } };
    const p = pin(m, 'b', 'q', 'B', 9);
    expect(p.a).toBeUndefined();
    expect(p.b).toMatchObject({ label: 'q', pinned: true, pinAt: 9 });
  });
  it('sanitize keeps the set prefix-free, pinned first then recent', () => {
    const m: Memory = {
      old: { label: 'a', name: '', used: 1, uses: 1 },
      recent: { label: 'as', name: '', used: 5, uses: 1 },
      pinned: { label: 'd', name: '', used: 0, uses: 1, pinned: true },
      clash: { label: 'df', name: '', used: 9, uses: 1 },
    };
    expect(Object.keys(sanitize(m)).sort()).toEqual(['pinned', 'recent']);
  });
});

describe('assignLabels', () => {
  it('remembered labels, labels from text, generated labels, all prefix-free', () => {
    const memory: Memory = { home: { label: 'h', name: 'Home', used: 1, uses: 3 } };
    const targets = [t('home', 'Home'), t('exp', 'Explore'), ...Array.from({ length: 40 }, (_, i) => t(`f${i}`, `Filler ${i}`))];
    const { local } = assignLabels(targets, memory, { alphabet: ALPHA, useMemory: true });
    expect(local[0].label).toBe('h');
    expect(local[1].label).toBe('e');
    expect(isPrefixFree(local.map((l) => l.label))).toBe(true);
    expect(local.slice(2).every((l) => !/^[he]/.test(l.label))).toBe(true);
  });
  it('identical elements: the copy nearest the centre gets the remembered label', () => {
    const memory: Memory = { like: { label: 'l', name: 'Like', used: 1, uses: 1 } };
    const { local } = assignLabels([t('like', 'Like', 300), t('like', 'Like', 10)], memory, { alphabet: ALPHA, useMemory: true });
    expect(local[1].label).toBe('l');
    expect(local[0].label).not.toBe('l');
    expect(local[0].unique).toBe(false);
  });
  it('text selection hints use no memory and no labels from text', () => {
    const memory: Memory = { x: { label: 'a', name: 'X', used: 1, uses: 1 } };
    const { local, forgot } = assignLabels([t(null, 'Explore')], memory, { alphabet: ALPHA, useMemory: false });
    expect(local[0].label).not.toBe('a'); // saved labels are still reserved
    expect(local[0].label).not.toBe('e'); // no label from text
    expect(forgot).toEqual([]);
  });
  it('forgets the weakest memories rather than going to three keys', () => {
    const memory: Memory = Object.fromEntries('asdfghjklqwertyuiop'.split('').map((c, i) => [`m${c}`, { label: c, name: '', used: i, uses: 1 }]));
    const targets = Array.from({ length: 30 }, (_, i) => t(`n${i}`, `Same`));
    const { local, forgot } = assignLabels(targets, memory, { alphabet: ALPHA, useMemory: true });
    expect(local.every((l) => l.label.length <= 2)).toBe(true);
    expect(forgot.length).toBeGreaterThan(0);
    expect(forgot[0]).toBe('ma'); // least used, then least recent
  });
  it('frame hints get extra generated labels', () => {
    const { local, extra } = assignLabels([t('a', 'Alpha')], {}, { alphabet: ALPHA, useMemory: true, extra: 2 });
    expect(extra).toHaveLength(2);
    expect(isPrefixFree([...local.map((l) => l.label), ...extra])).toBe(true);
  });
});

describe('summaries', () => {
  it('learned keys and the weekly summary', () => {
    const now = 10 * 24 * 3600 * 1000;
    const m: Memory = {
      a: { label: 'h', name: 'Home', used: 1, uses: 4, since: now - 1000 },
      b: { label: 't', name: 'Talk', used: 1, uses: 9, since: now - 30 * 24 * 3600 * 1000 },
      c: { label: 'qw', name: 'Help', used: 1, uses: 5 },
    };
    expect(learnedKeys(m).map((k) => k.key)).toEqual(['h', 't']);
    const s = weekSummary(m, now);
    expect(s.learned.map((k) => k.name)).toEqual(['Home']);
    expect(s.top.map((k) => k.name)).toEqual(['Talk', 'Help', 'Home']);
  });
  it('keepFitting drops labels with removed letters, keeps single keys', () => {
    const m: Memory = { a: { label: 'qw', name: '', used: 1, uses: 1 }, b: { label: 'n', name: '', used: 1, uses: 1 }, c: { label: 'as', name: '', used: 1, uses: 1 } };
    const { memory, dropped } = keepFitting(m, 'asdfjkl');
    expect(Object.keys(memory).sort()).toEqual(['b', 'c']);
    expect(dropped).toBe(1);
  });
});
