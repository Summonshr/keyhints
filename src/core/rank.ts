// Palette ranking. Pure.

export type ItemKind = 'command' | 'page' | 'tab' | 'bookmark' | 'history' | 'closed';

export interface Rankable {
  kind: ItemKind;
  title: string;
  words?: string; // extra words that should find it ("back previous page return")
  url?: string;
}

// Ties go to commands first; a closed tab last, so the same address in history or bookmarks wins.
const KIND_ORDER: Record<ItemKind, number> = { command: 0, page: 1, tab: 2, bookmark: 3, history: 4, closed: 5 };
// Spoken or typed filler that shouldn't have to match ("click the reply button").
const FILLER = new Set(['please', 'the', 'a', 'an', 'click', 'press', 'tap', 'open', 'go', 'to', 'on', 'button', 'link']);

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Every word must appear in the title, the extra words, or the URL. Words at the start of the title
// or of a word score higher; a word found only in the URL counts for very little.
export function score(words: string[], item: Rankable): number | null {
  const title = item.title.toLowerCase();
  const hay = `${title} ${item.words || ''}`.toLowerCase();
  const url = (item.url || '').toLowerCase();
  let total = 0;
  for (const w of words) {
    const i = hay.indexOf(w);
    if (i < 0) {
      if (!url.includes(w)) return null;
      total += 0.25;
      continue;
    }
    total += i === 0 ? 3 : /[^\p{L}\p{N}]/u.test(hay[i - 1]) ? 2 : 1;
    if (title.startsWith(w)) total += 2;
  }
  return total;
}

// The best 8 matches. If nothing matches every word, filler words are dropped and it tries again.
export function rank<T extends Rankable>(query: string, items: T[], limit = 8): T[] {
  const all = normalizeQuery(query).split(' ').filter(Boolean);
  const attempt = (words: string[]) => items
    .map((item) => ({ item, s: words.length ? score(words, item) : 0 }))
    .filter((r): r is { item: T; s: number } => r.s !== null)
    .sort((a, b) => b.s - a.s || KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind]);
  let ranked = attempt(all);
  if (!ranked.length) ranked = attempt(all.filter((w) => !FILLER.has(w)));
  return ranked.slice(0, limit).map((r) => r.item);
}
