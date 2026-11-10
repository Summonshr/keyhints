// The content script: runs in every frame of every page (and on the welcome page, which loads it).

import type { ModeId } from '../core/modes';
import type { PageMessage } from '../shared/messages';
import { installKeyClaims } from '../dom/keys';
import { handleFrameMessage, IS_TOP } from './frames';
import { start } from './hints';
import { startItems } from './items';
import { PALETTE_EVENTS, paletteEvent, startPalette } from './palette';
import { installLearning } from './learn';
import { installTips } from './tips';
import { keycastCommand } from './keycast';
import { reportSiteState, toggleSite } from './site-switch';
import { onKeyDown } from './keyboard';
import { alive, setLifecycle, type Lifecycle } from './lifecycle';
import { onSettingsChanged, ready } from './store';
import { IDLE, setState, state } from './state';
import './visual'; // registers text selection with activate.ts

let started = false;

function onMessage(msg: PageMessage) {
  if (handleFrameMessage(msg)) {
    return;
  }
  keycastCommand(msg.type);
  switch (msg.type) {
    case 'toggle-hints':
      if (state.phase === 'idle' || state.phase === 'prefix') start('click');
      else setState(IDLE);
      break;
    case 'toggle-site': toggleSite(); break;
    case 'open-palette': // Alt+K
      if (state.phase === 'palette') setState(IDLE);
      else { if (state.phase !== 'idle') setState(IDLE); startPalette(); }
      break;
    case 'item-mode': // Alt+I
      if (state.phase === 'items') setState(IDLE);
      else { if (state.phase !== 'idle') setState(IDLE); startItems(); }
      break;
  }
}

export function startContent(lifecycle: Lifecycle) {
  if (started) return;
  started = true;
  setLifecycle(lifecycle);
  // Keys before settings are read (the first moments of a page load) go to the page untouched.
  let loaded = false;
  ready.then(() => { loaded = true; });
  // Only real key presses: a page can dispatch KeyboardEvents of its own, and those must never
  // drive KeyHints (it clicks, opens tabs and reaches into frames of other sites).
  addEventListener('keydown', (e) => { if (e.isTrusted && alive() && loaded) onKeyDown(e); }, true);
  installKeyClaims(alive);
  // Whatever else the palette's input emits (it carries what is typed, dictated or pasted) stops
  // here, before the page's own listeners.
  for (const type of PALETTE_EVENTS) {
    addEventListener(type, (e) => { if (alive() && state.phase === 'palette' && e.target === state.host) paletteEvent(e); }, true);
  }
  installLearning();
  if (IS_TOP) installTips();
  chrome.runtime.onMessage.addListener((msg: PageMessage) => {
    if (!alive()) return;
    if (msg.type === 'start-request') { // hints asked for inside a child frame, whatever this frame is showing
      if (IS_TOP) ready.then(() => {
        if (state.phase === 'help' || state.phase === 'passkey') setState(IDLE); // no way from those straight to hints
        start(msg.mode as ModeId);
      });
      return;
    }
    ready.then(() => onMessage(msg));
  });
  ready.then(reportSiteState);
  onSettingsChanged(reportSiteState);
  // Replaced by a newer copy (KeyHints reloaded or updated): close whatever is open.
  lifecycle.onInvalidated(() => { document.querySelectorAll('keyhints-overlay').forEach((el) => el.remove()); });
}
