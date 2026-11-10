// Every key press goes through here first (a capture listener on the window), and goes to whichever
// phase the page is in (state.ts).

import { claim, notePress } from '../dom/keys';
import { isTyping } from '../dom/targets';
import { call } from '../shared/messages';
import { toast } from '../dom/overlay';
import { handleHintKey, start, undoNewKey, undoWindowOpen } from './hints';
import { helpKey, startHelp } from './help';
import { itemKey } from './items';
import { paletteKey } from './palette';
import { followPageLink, siteKeyAction } from './sites';
import { passKeyKey } from './site-switch';
import { siteDisabled, sitePassKeys } from './store';
import { videoKeyAction } from './video';
import { visualKey } from './visual';
import { keycastKey } from './keycast';
import { IDLE, setState, state } from './state';

const PREFIX_WAIT = 1000; // ms for the second key of y f, ]] and [[
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta'];

async function lastTab() {
  const res = await call('last-tab');
  if (!res.ok) toast(res.message);
}

export function onKeyDown(e: KeyboardEvent) {
  notePress(e);
  keycastKey(e);
  // A modifier going down on its own is not a key press yet. Acting on it would undo what the key
  // it leads to is about to do: Alt would cancel the hints (or post mode) that Alt+J (Alt+I) then
  // shows again, and Shift would close the "?" sheet that "?" then opens again. Only the palette
  // takes it, as "any key" stopping a pending voice run.
  if (MODIFIER_KEYS.includes(e.key) && state.phase !== 'palette') return;
  switch (state.phase) {
    case 'selecting': return visualKey(e);
    case 'hinting': return handleHintKey(e);
    case 'starting':
      // A browser/page shortcut cancels the hints that are still on their way, and goes through.
      if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab') return setState(IDLE);
      claim(e);
      return state.queued.push(e);
    case 'prefix': {
      const { key, expiresAt } = state;
      setState(IDLE);
      if (Date.now() < expiresAt && !e.ctrlKey && !e.altKey && !e.metaKey && !isTyping(e)) {
        const second = key === 'y' ? e.key === 'f' : e.key === key; // yf, ]] or [[
        if (second) {
          claim(e);
          return key === 'y' ? start('copy') : followPageLink(key === ']' ? 1 : -1);
        }
      }
      return idleKey(e);
    }
    case 'idle': return idleKey(e);
    case 'help': return helpKey(e, idleKey);
    case 'passkey': return passKeyKey(e);
    case 'items': return itemKey(e);
    case 'palette': return paletteKey(e);
  }
}

function idleKey(e: KeyboardEvent) {
  // Keys this site keeps for itself never reach KeyHints here (palette: "Leave a key to this site").
  if (!e.ctrlKey && !e.altKey && !e.metaKey && sitePassKeys().includes(e.key)) return;
  const video = videoKeyAction(e); // YouTube / Netflix controls (work even where bare f is the site's)
  if (video) { claim(e); video(); return; }
  // Ctrl+Left / Ctrl+Right: previous / next tab, like Ctrl+Shift+Tab / Ctrl+Tab. In a text field
  // they keep moving by word.
  if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isTyping(e)) {
    claim(e);
    call(e.key === 'ArrowRight' ? 'next-tab' : 'prev-tab');
    return;
  }
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || siteDisabled()) return;
  const site = siteKeyAction(e.key); // GitHub pull request / Jira keys
  if (site) { claim(e); site(); return; }
  if (e.key === 'f') { claim(e); start('click'); }
  else if (e.key === 'F') { claim(e); start('newtab'); }
  else if (e.key === ';') { claim(e); start('focus'); }
  else if (e.key === '`') { claim(e); lastTab(); }
  else if (e.key === '?') { claim(e); startHelp(); }
  else if (e.key === 'u' && undoWindowOpen()) { claim(e); undoNewKey(); }
  // Not claimed: sites may use plain "y", "]" or "[".
  else if (e.key === 'y' || e.key === ']' || e.key === '[') setState({ phase: 'prefix', key: e.key, expiresAt: Date.now() + PREFIX_WAIT });
}
