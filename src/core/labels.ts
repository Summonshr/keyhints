// Label generation. Pure: no DOM, no chrome.*.
//
// Labels are prefix-free (no label is the start of another), so a match fires the moment it's
// typed. Two kinds: labels from the element's own name ("Explore" -> e or ex, "Score card" -> sc),
// and generated labels from the hint alphabet for everything else.

// Prefix-free labels from `alphabet`, shortest first. `reserved` labels (remembered or taken from
// text) are never handed out, and nothing returned is a prefix of, or prefixed by, a reserved label.
// Returns null if reserved labels block every slot.
export function makeLabels(n: number, reserved: Set<string>, alphabet: string): string[] | null {
  const prefixes = new Set<string>();
  for (const r of reserved) for (let i = 1; i < r.length; i++) prefixes.add(r.slice(0, i));
  const free = (l: string) => l !== '' && !reserved.has(l) && !prefixes.has(l);

  const labels = [''];
  let offset = 0, freeCount = 0;
  while (freeCount < n) {
    if (offset >= labels.length) return null;
    const prefix = labels[offset++];
    if (free(prefix)) freeCount--;
    if (reserved.has(prefix)) continue; // never extend a reserved label
    for (const c of alphabet) {
      labels.push(prefix + c);
      if (free(prefix + c)) freeCount++;
    }
  }
  return labels.slice(offset).filter(free).slice(0, n);
}

// Shortest label length that fits n targets with nothing reserved.
export function neededLength(n: number, alphabet: string): number {
  let len = 1;
  while (alphabet.length ** len < n) len++;
  return len;
}

// Words of a name, accents dropped, each starting with a letter: "Créer 2 posts" -> creer, posts.
export function nameWords(text: string): string[] {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => /^[a-z]/.test(w));
}

// Two-key labels for a name, best first: initials of the first two words, then the first word's
// first letter with each later letter, then with the initials of later words.
export function nameLabels(words: string[]): string[] {
  const [first, ...rest] = words;
  const out = rest.length ? [first[0] + rest[0][0]] : [];
  for (const c of first.slice(1)) if (c >= 'a' && c <= 'z') out.push(first[0] + c);
  for (const w of rest.slice(1)) out.push(first[0] + w[0]);
  return [...new Set(out)];
}

// Labels from text for names[i], i in `want` (screen order), none clashing with `taken` (as a label
// or a prefix either way). A name that appears more than once among the wanted ones gets none (every
// post's "Reply"). One key only if `singles` and no other wanted name starts with that letter.
// Returns Map index -> label.
export function textLabels(names: string[], want: number[], taken: Iterable<string>, singles: boolean): Map<number, string> {
  const used = new Set(taken), prefixes = new Set<string>();
  for (const l of used) for (let i = 1; i < l.length; i++) prefixes.add(l.slice(0, i));
  // Labels from text are one or two keys, so only their first letter can be a taken label.
  const clashes = (l: string) => used.has(l) || prefixes.has(l) || used.has(l[0]);
  const out = new Map<number, string>();
  const take = (i: number, l: string) => { out.set(i, l); used.add(l); if (l.length === 2) prefixes.add(l[0]); };

  const words = new Map(want.map((i) => [i, nameWords(names[i])]));
  const count = new Map<string, number>();
  for (const w of words.values()) if (w.length) count.set(w.join(' '), (count.get(w.join(' ')) || 0) + 1);
  const named = want.filter((i) => words.get(i)!.length && count.get(words.get(i)!.join(' ')) === 1);
  const byLetter = new Map<string, number[]>();
  for (const i of named) {
    const letter = words.get(i)![0][0];
    byLetter.set(letter, [...(byLetter.get(letter) || []), i]);
  }

  if (singles) for (const [letter, group] of byLetter) if (group.length === 1 && !clashes(letter)) take(group[0], letter);
  for (const i of named) {
    if (out.has(i)) continue;
    const label = nameLabels(words.get(i)!).find((l) => !clashes(l));
    if (label) take(i, label);
  }
  return out;
}

// Every label is valid on its own and none is the start of another.
export function isPrefixFree(labels: string[]): boolean {
  const sorted = [...labels].sort();
  for (let i = 1; i < sorted.length; i++) if (sorted[i].startsWith(sorted[i - 1])) return false;
  return true;
}
