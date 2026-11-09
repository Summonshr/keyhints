// "?": a sheet of the keys that work on this page. Any key closes it; "?" again also reaches the
// site, so on GitHub or Jira "??" opens the site's own shortcut list.

import { learnedKeys, weekSummary } from '../core/memory';
import { createHost } from '../dom/overlay';
import { SITE, siteKeysHelp } from './sites';
import { videoKeysHelp } from './video';
import { host, memory, siteDisabled, sitePassKeys } from './store';
import { IDLE, onLeave, setState } from './state';

function helpSections(): [string, [string, string][]][] {
  const off = siteDisabled();
  const sections: [string, [string, string][]][] = [
    ['Anywhere', [
      ['Alt+J', 'hints: click links, focus fields'], ['Alt+K', 'command palette (type or dictate)'],
      ['Alt+I', 'post mode'], ['Alt+M', 'mute / unmute the tab, mute all others'], ['Ctrl+← →', 'previous / next tab, when not typing'],
    ]],
    [off ? 'Single keys (off on this site: toolbar button turns them on)' : 'Single keys, when not typing', [
      ['f', 'hints'], ['F', 'hints, open in a background tab'], [';', 'hints, focus only'], ['y f', 'hints, copy a link'],
      [']] [[', 'next / previous page'], ['`', 'the tab you were on before'], ['?', 'this sheet (again: the site’s own)'],
    ]],
  ];
  // What this site has learned: the keys to remember here, and the keys left to the site.
  const mine = learnedKeys(memory).map(({ key, name, pinned }): [string, string] => [`f ${key.toUpperCase()}`, `${name}${pinned ? ' (pinned)' : ''}`]);
  const kept = sitePassKeys().map((k): [string, string] => [k, 'left to the site (palette: “leave a key”)']);
  if (mine.length || kept.length) sections.push([`Your keys on ${host}`, [...mine, ...kept]]);
  const { learned, top } = weekSummary(memory, Date.now());
  if (learned.length) sections.push(['New this week', learned.map(({ key, name }) => [`f ${key.toUpperCase()}`, name])]);
  if (top.length) sections.push(['Most picked here', top.map(({ key, name, uses }) => [`f ${key.toUpperCase()}`, `${name} (${uses}×)`])]);
  const site = siteKeysHelp();
  if (site.length && !off) sections.push([SITE === 'github' ? 'GitHub pull request' : 'Jira', site]);
  const video = videoKeysHelp();
  if (video.length) sections.push(['Video', video]);
  sections.push(['While hints are showing', [
    ['C', 'copy link'], ['B', 'background tab'], ['M', 'open several'], ['V', 'hover'], [',', 'right click'], [';', 'focus only'],
    ['X', 'scroll a panel'], ['Z', 'select text'], ['/', 'filter'], ['.', 'repeat last pick'], ['!', 'pin a key'],
    ['1 … 0', 'Google results, YouTube videos'],
  ]]);
  sections.push(['Post mode (Alt+I)', [
    ['j k', 'move'], ['l r t b', 'like, reply, repost, bookmark'], ['m p', 'mute, play'], ['o', 'open'],
    ['c', 'copy link'], ['y', 'copy text'], ['s', 'save as image'], ['f', 'hints in the post'],
  ]]);
  return sections;
}

export function startHelp() {
  const { host: overlay, root } = createHost();
  const sheet = document.createElement('div');
  sheet.className = 'help';
  for (const [title, keys] of helpSections()) {
    const h = document.createElement('h3');
    h.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'keys';
    for (const [k, what] of keys) {
      const key = document.createElement('span');
      key.className = 'k';
      key.textContent = k;
      const desc = document.createElement('span');
      desc.textContent = what;
      grid.append(key, desc);
    }
    sheet.append(h, grid);
  }
  const foot = document.createElement('div');
  foot.className = 'pfooter';
  foot.textContent = 'Any key closes · ? again opens the site’s own shortcuts · Settings: Alt+K, “settings”';
  sheet.append(foot);
  root.appendChild(sheet);
  setState({ phase: 'help', host: overlay });
}

onLeave('help', (prev) => prev.host.remove());

// Any key closes the sheet; Esc stops there, "?" goes on to the site, other keys work as usual.
export function helpKey(e: KeyboardEvent, idleKey: (e: KeyboardEvent) => void) {
  setState(IDLE);
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (e.key !== '?') idleKey(e);
}
