// Show keys: a small badge in the bottom-left corner shows the keys you press, for screen sharing,
// recordings and pair work. Off by default (settings). Never shows what you type: keys pressed in a
// text field or in the palette are left out, unless they come with Ctrl / Alt / Meta.

import { createHost } from '../dom/overlay';
import { isTyping } from '../dom/targets';
import { IS_TOP } from './frames';
import { settings } from './store';
import { state } from './state';

const KEY_NAMES: Record<string, string> = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Backspace: '⌫', Enter: '⏎' };
let box: { host: HTMLElement; line: HTMLElement; timer: number } | null = null;

function keyName(e: KeyboardEvent): string {
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.metaKey && 'Meta'].filter(Boolean) as string[];
  const key = KEY_NAMES[e.key] || (e.key.length === 1 && mods.length ? e.key.toUpperCase() : e.key);
  return [...mods, key].join('+');
}

// Adds a key (or a note like "⌨ Show hints") to the badge; it clears 1.5 s after the last one.
export function keycast(text: string) {
  if (!settings.keycast || !IS_TOP) return;
  if (!box || !box.host.isConnected) {
    const { host, root } = createHost();
    const line = document.createElement('div');
    line.className = 'keycast';
    root.append(line);
    box = { host, line, timer: 0 };
  }
  const span = document.createElement('span');
  span.textContent = text;
  box.line.append(span);
  while (box.line.childElementCount > 8) box.line.firstChild!.remove();
  clearTimeout(box.timer);
  box.timer = window.setTimeout(() => { box!.host.remove(); box = null; }, 1500);
}

// Called for every key before KeyHints acts on it (so keys it then consumes still show).
export function keycastKey(e: KeyboardEvent) {
  if (!settings.keycast || !IS_TOP || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
  const chord = e.ctrlKey || e.altKey || e.metaKey;
  if (!chord && (isTyping(e) || state.phase === 'palette')) return;
  keycast(keyName(e));
}

// Browser shortcuts (Alt+J, Alt+K, Alt+I) never reach the page as keys; show what they did.
const COMMAND_NAMES: Record<string, string> = { 'toggle-hints': 'Show hints', 'open-palette': 'Palette', 'item-mode': 'Post mode' };
export function keycastCommand(type: string) {
  if (COMMAND_NAMES[type]) keycast(`⌨ ${COMMAND_NAMES[type]}`);
}
