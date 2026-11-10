import { defineConfig } from 'wxt';

// The extension's manifest. Entry points live in src/entrypoints (WXT reads them from there).
export default defineConfig({
  srcDir: 'src',
  outDir: '.output',
  manifestVersion: 3,
  manifest: {
    // The store listing's title and summary come from here (STORE.md has the rest of the listing).
    name: 'KeyHints – Click Anything Without a Mouse',
    short_name: 'KeyHints',
    description: 'Press Alt+J and every link and button gets a key. Your favourite buttons learn their own letter. No account, no tracking.',
    // sessions: the palette's "Reopen closed tab" restores the tab with its history.
    // scripting: after an update, open tabs get the new content script without a reload.
    permissions: ['storage', 'tabs', 'tabGroups', 'sessions', 'scripting'],
    optional_permissions: ['bookmarks', 'history'],
    host_permissions: ['<all_urls>'],
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: {
      default_title: 'KeyHints: click to turn single-key shortcuts off here',
      default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
    },
    commands: {
      'show-hints': { suggested_key: { default: 'Alt+J' }, description: 'Show hints (click links, focus inputs)' },
      'mute-other-tabs': { suggested_key: { default: 'Alt+M' }, description: 'Mute / unmute this tab, and mute all other tabs' },
      'open-palette': { suggested_key: { default: 'Alt+K' }, description: 'Command palette (type or dictate)' },
      'post-mode': { suggested_key: { default: 'Alt+I' }, description: 'Post mode: j/k between posts, single-key actions' },
      'toggle-mute': { description: 'Mute / unmute the current tab' },
    },
  },
});
