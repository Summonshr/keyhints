// Element identity: what lets a saved label find its element again on a later visit, after the page
// layout changed. Pure: dom/identity.ts reads the fields off the element.

export interface IdentityFields {
  tag: string;
  role: string;
  testid: string;
  aria: string;
  id: string; // only ids that look stable (see stableId)
  name: string;
  placeholder: string;
  type: string;
  href: string; // host (if another site) + path; no query or hash
  text: string;
}

// Buttons that rename themselves when pressed count as one button.
const TOGGLES: [RegExp, string][] = [
  [/\bunmute\b/g, 'mute'], [/\bpause\b/g, 'play'], [/\b(unlike|liked)\b/g, 'like'],
  [/\b(unfollow|following)\b/g, 'follow'], [/\bcollapse\b/g, 'expand'], [/\bshow less\b/g, 'show more'],
];

// Numbers are dropped, with "unread" / "new" after them, so "Show 35 posts" and "Show 12 posts" are
// the same button, and so are "Notifications" and its unread badge ("1 Notifications",
// "Notifications (3 unread)").
export function normalize(s: string): string {
  const plain = s.toLowerCase().replace(/\(?\d+\+?( unread| new)?\)?/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return TOGGLES.reduce((acc, [re, word]) => acc.replace(re, word), plain);
}

// Generated ids (React ":r1a:", "radix-…", "mui-…", hashes) change between page loads.
export function stableId(id: string): string {
  if (!id || id.length > 40 || /\d/.test(id)) return '';
  if (/^(radix|mui|headlessui|react|ember|svelte|ng-|_)/i.test(id)) return '';
  return id;
}

// The key a saved label is stored under. Fields are normalized, so cosmetic changes don't count.
export function identityKey(f: IdentityFields): string {
  return JSON.stringify([
    f.tag.toUpperCase().slice(0, 40), normalize(f.role), normalize(f.testid), normalize(f.aria), normalize(stableId(f.id)),
    normalize(f.name), normalize(f.placeholder), normalize(f.type), normalize(f.href), normalize(f.text),
  ]);
}

// A short readable name for the "?" sheet and settings: the text, else the aria-label, placeholder,
// or link path. One that is only spaces doesn't count (floating-label fields have placeholder=" ").
export function displayName(f: Pick<IdentityFields, 'text' | 'aria' | 'placeholder' | 'href'>): string {
  const name = ([f.text, f.aria, f.placeholder, f.href].map((s) => s.replace(/\s+/g, ' ').trim()).find(Boolean) || '(unnamed)').slice(0, 60);
  return name[0].toUpperCase() + name.slice(1);
}
