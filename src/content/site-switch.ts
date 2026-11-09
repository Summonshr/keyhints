// Single keys on or off for this site (toolbar button, palette), and keys left to the site.

import { call } from '../shared/messages';
import { createHost, makeBar, renderBar, toast } from '../dom/overlay';
import { IS_TOP } from './frames';
import { host, siteDisabled, sitePassKeys } from './store';
import { IDLE, onLeave, setState } from './state';

// The toolbar badge says "off" where single keys are off.
export function reportSiteState() {
  if (IS_TOP) call('site-state', { disabled: siteDisabled() });
}

export async function toggleSite() {
  const { off } = await call('toggle-site', { host });
  toast(off ? `Single-key shortcuts off on ${host} (Alt+J still works)` : `Single-key shortcuts on for ${host}`);
}

// "Leave a key to this site": the next key pressed is given to the site, or taken back.
export function startPassKey() {
  const { host: overlay, root } = createHost();
  const bar = makeBar(root);
  const kept = sitePassKeys();
  renderBar(bar, 'LEAVE A KEY', [[`press the key ${host} should keep${kept.length ? ` (keeps: ${kept.join(' ')}; press one again to take it back)` : ''}`], ['Esc', 'cancel']]);
  setState({ phase: 'passkey', host: overlay });
}

onLeave('passkey', (prev) => prev.host.remove());

export async function passKeyKey(e: KeyboardEvent) {
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') return setState(IDLE);
  if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return; // a single key, no modifiers
  setState(IDLE);
  const { keeps } = await call('toggle-pass-key', { host, key: e.key });
  toast(keeps ? `${host} keeps ${e.key} now; every other KeyHints key still works here` : `${e.key} is KeyHints' again on ${host}`);
}
