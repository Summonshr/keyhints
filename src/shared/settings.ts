// Settings: one definition, read by the content script, the background and the settings page.

export const DEFAULT_ALPHABET = 'asdfghjkl' + 'qwertyuiop'; // home row first, then top row

// Sites whose own single-key shortcuts beat ours (f is fullscreen on YouTube and Netflix, forward in
// Gmail; Docs and Figma type through hidden frames, where a bare f would be swallowed). Bare keys are
// left to these sites unless turned back on with the toolbar button or in settings.
export const SITES_WITH_OWN_KEYS = ['youtube.com', 'netflix.com', 'mail.google.com', 'docs.google.com', 'figma.com'];

export type HintSize = 'small' | 'normal' | 'large';
export type HintColors = 'site' | 'dark' | 'light';

export interface Settings {
  alphabet: string; // letters for generated labels, easiest first
  disabledSites: string[]; // hosts where single keys are off
  enabledSites: string[]; // built-in sites (SITES_WITH_OWN_KEYS) switched back on
  passKeys: Record<string, string[]>; // { [host]: ['f', …] } keys left to the site
  hintSize: HintSize;
  hintColors: HintColors;
  keycast: boolean; // show the keys pressed, for screen shares
  tips: boolean; // one-time tips
}

export const DEFAULT_SETTINGS: Settings = {
  alphabet: DEFAULT_ALPHABET,
  disabledSites: [],
  enabledSites: [],
  passKeys: {},
  hintSize: 'normal',
  hintColors: 'site',
  keycast: false,
  tips: true,
};

export function readSettings(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function hasOwnKeys(host: string): boolean {
  return SITES_WITH_OWN_KEYS.some((d) => host === d || host.endsWith(`.${d}`));
}

export function siteDisabled(settings: Settings, host: string): boolean {
  return settings.disabledSites.includes(host) || (hasOwnKeys(host) && !settings.enabledSites.includes(host));
}

// Lowercase letters, no repeats, at least 4. Returns an error message, or null when it's fine.
export function validateAlphabet(a: string): string | null {
  if (!/^[a-z]+$/.test(a)) return 'Use lowercase letters a–z only.';
  if (new Set(a).size !== a.length) return 'Each letter may appear only once.';
  if (a.length < 4) return 'Use at least 4 letters.';
  return null;
}
