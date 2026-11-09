// Claiming a key: a key KeyHints acts on must not reach the page at all, press or release.
// Sites act on releases too (YouTube jumps chapters on a Ctrl+arrow keyup), and when a key switches
// tabs its release lands on the other tab, whose page never saw the press.

const claimed = new Set<string>(); // keys pressed for KeyHints whose release this page should swallow
const downHere = new Set<string>(); // presses this page saw since it last had focus

// Stops the event and swallows its release.
export function claim(e: KeyboardEvent) {
  e.preventDefault();
  e.stopImmediatePropagation();
  claimed.add(e.code);
}

// Call first thing on every keydown.
export function notePress(e: KeyboardEvent) {
  downHere.add(e.code);
}

// The release of a Ctrl+← / Ctrl+→ that switched another tab to this one: this page saw no press.
const tabSwitchRelease = (e: KeyboardEvent) => e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');

export function installKeyClaims(isActive: () => boolean) {
  // Losing focus (a tab switch, a click into another window): releases go elsewhere now.
  addEventListener('blur', () => { downHere.clear(); claimed.clear(); });
  addEventListener('keyup', (e) => {
    if (!isActive()) return;
    const sawPress = downHere.delete(e.code);
    if (!claimed.delete(e.code) && (sawPress || !tabSwitchRelease(e))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}
