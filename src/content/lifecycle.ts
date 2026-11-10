// Is this copy of the content script still the live one? After KeyHints is reloaded or updated, the
// copy already running in a tab is cut off from the extension (every chrome.* call throws
// "Extension context invalidated"), and the background injects a new copy. The old one goes quiet.

export interface Lifecycle {
  readonly isInvalid: boolean;
  onInvalidated(cb: () => void): void;
}

let lifecycle: Lifecycle = { isInvalid: false, onInvalidated() {} };

export function setLifecycle(l: Lifecycle) {
  lifecycle = l;
}

export const alive = () => !lifecycle.isInvalid && !!chrome.runtime?.id;
