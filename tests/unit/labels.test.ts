import { describe, expect, it } from 'vitest';
import { isPrefixFree, makeLabels, nameLabels, nameWords, neededLength, textLabels } from '../../src/core/labels';

const ALPHA = 'asdfghjklqwertyuiop';

describe('makeLabels', () => {
  it('gives n prefix-free labels, shortest first', () => {
    const l = makeLabels(40, new Set(), ALPHA)!;
    expect(l).toHaveLength(40);
    expect(isPrefixFree(l)).toBe(true);
    expect(Math.max(...l.map((x) => x.length))).toBe(2);
  });
  it('never hands out or collides with reserved labels', () => {
    const reserved = new Set(['a', 'sd']);
    const l = makeLabels(30, reserved, ALPHA)!;
    expect(l.some((x) => x.startsWith('a') || x === 'sd' || x === 's')).toBe(false);
    expect(isPrefixFree([...l, ...reserved])).toBe(true);
  });
  it('returns null when reserved labels block every slot', () => {
    expect(makeLabels(1, new Set(['a', 'b']), 'ab')).toBeNull();
  });
  it('neededLength', () => {
    expect(neededLength(19, ALPHA)).toBe(1);
    expect(neededLength(20, ALPHA)).toBe(2);
  });
});

describe('labels from text', () => {
  it('splits names into words, dropping accents, numbers and punctuation', () => {
    expect(nameWords('Créer 2 posts!')).toEqual(['creer', 'posts']);
    expect(nameWords('129 languages')).toEqual(['languages']);
  });
  it('orders candidates: two-word initials, then letters of the first word', () => {
    expect(nameLabels(['score', 'card'])).toEqual(['sc', 'so', 'sr', 'se']);
    expect(nameLabels(['explore']).slice(0, 2)).toEqual(['ex', 'ep']);
  });
  it('Explore gets e when alone with that letter; Score card sc and Search se share s', () => {
    const names = ['Score card', 'Search', 'Explore'];
    const m = textLabels(names, [0, 1, 2], [], true);
    expect([m.get(0), m.get(1), m.get(2)]).toEqual(['sc', 'se', 'e']);
  });
  it('Home, Explore, Notifications get h, e, n; repeated names get none', () => {
    const names = ['Home', 'Explore', 'Notifications', ...Array.from({ length: 5 }, (_, i) => `Filler ${i}`)];
    const m = textLabels(names, names.map((_, i) => i), [], true);
    expect([m.get(0), m.get(1), m.get(2)]).toEqual(['h', 'e', 'n']);
    expect([3, 4, 5, 6, 7].some((i) => m.has(i))).toBe(false);
  });
  it('avoids taken labels and their prefixes in both directions', () => {
    const m = textLabels(['Explore', 'Help'], [0, 1], ['e', 'hx'], true);
    expect(m.has(0)).toBe(false); // every e… clashes with the taken e
    expect(m.get(1)).toBe('he'); // h is a prefix of the taken hx
  });
  it('without singles, everything gets two keys', () => {
    const m = textLabels(['Explore'], [0], [], false);
    expect(m.get(0)).toBe('ex');
  });
});
