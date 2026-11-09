import { describe, expect, it } from 'vitest';
import { rank, type Rankable } from '../../src/core/rank';
import { modeForKey } from '../../src/core/modes';
import { clock } from '../../src/core/clock';

const items: Rankable[] = [
  { kind: 'command', title: 'Scroll down', words: 'down page down' },
  { kind: 'command', title: 'Close tab', words: 'close tab' },
  { kind: 'history', title: 'Page two', url: 'http://x/page2' },
  { kind: 'closed', title: 'Page two', url: 'http://x/page2' },
  { kind: 'page', title: 'Reply' },
];

describe('rank', () => {
  it('matches every word, best first', () => {
    expect(rank('scroll down', items)[0].title).toBe('Scroll down');
  });
  it('drops filler words when nothing matches all of them', () => {
    expect(rank('click the reply button', items)[0].title).toBe('Reply');
  });
  it('a closed tab ranks below history for the same address', () => {
    expect(rank('page2', items).map((i) => i.kind)).toEqual(['history', 'closed']);
  });
});

describe('mode keys', () => {
  it('Shift+letter switches mode only before a label is started', () => {
    expect(modeForKey('C', '')).toBe('copy');
    expect(modeForKey('C', 's')).toBeNull();
    expect(modeForKey(',', 's')).toBe('context');
    expect(modeForKey('c', '')).toBeNull();
  });
});

describe('clock', () => {
  it('formats', () => {
    expect(clock(75)).toBe('1:15');
    expect(clock(3725)).toBe('1:02:05');
  });
});
