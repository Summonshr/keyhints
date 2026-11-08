// Show keys: a small badge in the bottom-left corner shows the keys you press, for screen sharing,
// recordings and pair work, so people watching can follow along. Off by default (settings).
// Never shows what you type: keys pressed in a text field or in the palette are left out,
// unless they come with Ctrl / Alt / Meta.
// Loaded before main.js so its capture listener sees keys that main.js then consumes.

let keycastOn = false;
let keycastBox = null; // { host, line, timer }

if (window === window.top) {
  chrome.storage.local.get('keycast').then((r) => { keycastOn = !!r.keycast; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.keycast) keycastOn = !!changes.keycast.newValue;
  });

  addEventListener('keydown', (e) => {
    if (!keycastOn || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    const chord = e.ctrlKey || e.altKey || e.metaKey;
    const phase = typeof state === 'undefined' ? 'idle' : state.phase; // main.js
    if (!chord && (isTyping(e) || phase === 'palette')) return;
    keycast(keyName(e));
  }, true);

  // Browser shortcuts (Alt+J, Alt+K, Alt+I) never reach the page as keys; show what they did.
  const COMMAND_NAMES = { 'toggle-hints': 'Show hints', 'open-palette': 'Palette', 'item-mode': 'Post mode' };
  chrome.runtime.onMessage.addListener((msg) => {
    if (keycastOn && COMMAND_NAMES[msg.type]) keycast(`⌨ ${COMMAND_NAMES[msg.type]}`);
  });
}

const KEY_NAMES = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Backspace: '⌫', Enter: '⏎' };

function keyName(e) {
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.metaKey && 'Meta'].filter(Boolean);
  const key = KEY_NAMES[e.key] || (e.key.length === 1 && mods.length ? e.key.toUpperCase() : e.key);
  return [...mods, key].join('+');
}

// Adds a key (or a note like "→ Home") to the badge; the badge clears 1.5 s after the last one.
function keycast(text) {
  if (!keycastOn || window !== window.top) return;
  if (!keycastBox || !keycastBox.host.isConnected) {
    const { host, root } = createHost(); // ui.js
    const style = document.createElement('style');
    style.textContent = `.keycast { position: fixed; left: 16px; bottom: 16px; display: flex; gap: 6px;
      font: 600 15px ui-monospace, monospace; }
      .keycast span { padding: 5px 10px; border-radius: 6px; background: var(--surface); color: var(--surface-fg);
      box-shadow: var(--shadow); }`;
    const line = document.createElement('div');
    line.className = 'keycast';
    root.append(style, line);
    keycastBox = { host, line, timer: 0 };
  }
  const { line } = keycastBox;
  const span = document.createElement('span');
  span.textContent = text;
  line.append(span);
  while (line.childElementCount > 8) line.firstChild.remove();
  clearTimeout(keycastBox.timer);
  keycastBox.timer = setTimeout(() => { keycastBox.host.remove(); keycastBox = null; }, 1500);
}
