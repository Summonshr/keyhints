import { describe, expect, it } from 'vitest';
import { applyPins, CLOCK_SLACK, mergePinMaps, pinsOf, validPins, type PinMap } from '../../src/core/sync';
import { validateSettings, DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { Memory } from '../../src/shared/storage';

const now = 1_000_000_000_000;
const pin = (at: number, more = {}) => ({ label: 'h', name: 'Home', pinned: true, at, ...more });

describe('pins from sync', () => {
  it('per element, the newer record wins', () => {
    expect(mergePinMaps({ a: pin(1) }, { a: pin(2, { pinned: false }) }).a.pinned).toBe(false);
    expect(mergePinMaps({ a: pin(3) }, { a: pin(2, { pinned: false }) }).a.pinned).toBe(true);
  });
  it('a record dated in the future, or malformed, is ignored', () => {
    const pins = {
      ok: pin(now), ahead: pin(now + CLOCK_SLACK - 1), future: pin(1e308), nan: pin(NaN),
      array: pin(now, { label: ['h'] }), empty: pin(now, { label: '' }), noname: pin(now, { name: 5 }), flag: pin(now, { pinned: 'yes' }),
    } as unknown as PinMap;
    expect(Object.keys(validPins(pins, now)).sort()).toEqual(['ahead', 'ok']);
  });
  it('applies a newer pin and unpin, and sends back what it applied', () => {
    const memory: Memory = { a: { label: 'q', name: 'A', used: 1, uses: 1, pinned: true, pinAt: 5 } };
    const next = applyPins(memory, { a: pin(9, { label: 'q', name: 'A', pinned: false }), b: pin(9) });
    expect(next.a.pinned).toBe(false);
    expect(next.b).toMatchObject({ label: 'h', pinned: true, pinAt: 9 });
    expect(pinsOf(next).b.at).toBe(9);
  });
});

describe('settings from an import, sync or a request', () => {
  it('the defaults pass; an empty alphabet and wrong shapes do not', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
    for (const bad of [{ alphabet: '' }, { alphabet: 5 }, { disabledSites: 'x.com' }, { passKeys: ['f'] }, { passKeys: { 'x.com': 'f' } },
      { hintSize: 'huge' }, { hintColors: 7 }, { keycast: 'yes' }]) {
      expect(validateSettings({ ...DEFAULT_SETTINGS, ...bad } as never), JSON.stringify(bad)).not.toBeNull();
    }
  });
});
