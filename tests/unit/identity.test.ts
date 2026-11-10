import { describe, expect, it } from 'vitest';
import { displayName, identityKey, normalize, stableId, type IdentityFields } from '../../src/core/identity';

const base: IdentityFields = { tag: 'a', role: '', testid: '', aria: '', id: '', name: '', placeholder: '', type: '', href: '/notifications', text: 'Notifications' };

describe('identity', () => {
  it('drops numbers and unread counts', () => {
    for (const s of ['Notifications', '1 Notifications', 'Notifications (3 unread)', 'Notifications 99+ new']) {
      expect(normalize(s)).toBe('notifications');
    }
    expect(normalize('Show 35 posts')).toBe(normalize('Show 12 posts'));
  });
  it('counts self-renaming buttons as one', () => {
    expect(normalize('Unmute')).toBe(normalize('Mute'));
    expect(normalize('Unfollow')).toBe(normalize('Follow'));
    expect(normalize('Show less')).toBe(normalize('Show more'));
  });
  it('an unread badge does not change the identity', () => {
    expect(identityKey({ ...base, text: '1 Notifications' })).toBe(identityKey(base));
  });
  it('ignores generated ids', () => {
    expect(stableId(':r1a:')).toBe('');
    expect(stableId('radix-abc')).toBe('');
    expect(stableId('submit')).toBe('submit');
  });
  it('makes a readable name', () => {
    expect(displayName({ text: 'notifications', aria: '', placeholder: '', href: '' })).toBe('Notifications');
    expect(displayName({ text: '', aria: '', placeholder: '', href: '' })).toBe('(unnamed)');
    expect(displayName({ text: '', aria: ' ', placeholder: ' ', href: '' }), 'a floating-label field: placeholder=" "').toBe('(unnamed)');
    expect(displayName({ text: '', aria: ' ', placeholder: 'search', href: '' })).toBe('Search');
  });
});
