// The key space while hints are showing. Lowercase letters and digits are labels; modes are
// Shift+letter (before a label is started) or punctuation, so every lowercase letter is free for
// labels taken from an element's name ("Cart" -> c).

export type ModeId = 'click' | 'copy' | 'newtab' | 'multi' | 'hover' | 'context' | 'focus' | 'scroll' | 'text';
export type TargetKind = 'clickable' | 'scroll' | 'text';

export interface Mode {
  name: string; // shown in the bar
  targets: TargetKind; // modes sharing targets switch in place (labels stay the same)
  key?: string; // e.key that switches to it
  linksOnly?: boolean;
  help?: string;
}

export const MODES: Record<ModeId, Mode> = {
  click: { name: 'CLICK', targets: 'clickable' },
  copy: { name: 'COPY LINK', targets: 'clickable', key: 'C', linksOnly: true },
  newtab: { name: 'BACKGROUND TAB', targets: 'clickable', key: 'B', linksOnly: true },
  multi: { name: 'OPEN SEVERAL', targets: 'clickable', key: 'M', linksOnly: true },
  hover: { name: 'HOVER', targets: 'clickable', key: 'V' },
  context: { name: 'RIGHT CLICK', targets: 'clickable', key: ',' },
  focus: { name: 'FOCUS ONLY', targets: 'clickable', key: ';' },
  scroll: { name: 'SCROLL PANEL', targets: 'scroll', key: 'X', help: 'pick a panel, then arrows / Space / PgDn scroll it' },
  text: { name: 'SELECT TEXT', targets: 'text', key: 'Z', help: 'pick where to start' },
};

export const MODE_BY_KEY: Record<string, ModeId> = Object.fromEntries(
  (Object.entries(MODES) as [ModeId, Mode][]).filter(([, m]) => m.key).map(([id, m]) => [m.key!, id]),
);

// Shift+letter switches mode only before a label is started; after that, Shift on the last letter
// opens the pick in a background tab. Punctuation mode keys work any time.
export function modeForKey(key: string, typed: string): ModeId | null {
  const mode = MODE_BY_KEY[key];
  if (!mode) return null;
  return typed === '' || !/^[A-Z]$/.test(key) ? mode : null;
}
