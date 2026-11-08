// "?": a sheet of the keys that work on this page. Any key closes it; "?" again also reaches the
// site, so on GitHub or Jira "??" opens the site's own shortcut list.

function helpSections() {
  const off = siteDisabled();
  const sections = [
    ['Anywhere', [
      ['Alt+J', 'hints: click links, focus fields'], ['Alt+K', 'command palette (type or dictate)'],
      ['Alt+I', 'post mode'], ['Alt+M', 'mute / unmute the tab'], ['Ctrl+← →', 'previous / next tab, when not typing'],
    ]],
    [off ? 'Single keys (off on this site: toolbar button turns them on)' : 'Single keys, when not typing', [
      ['f', 'hints'], ['F', 'hints, open in a background tab'], [';', 'hints, focus only'], ['y f', 'hints, copy a link'],
      [']] [[', 'next / previous page'], ['`', 'the tab you were on before'], ['?', 'this sheet (again: the site’s own)'],
    ]],
  ];
  const site = siteKeysHelp(); // sites.js
  if (site.length && !off) sections.push([SITE === 'github' ? 'GitHub pull request' : 'Jira', site]);
  const video = videoKeysHelp(); // video.js
  if (video.length) sections.push(['Video', video]);
  sections.push(['While hints are showing', [
    ['c', 'copy link'], ['b', 'background tab'], ['m', 'open several'], ['v', 'hover'], [';', 'focus only'],
    ['x', 'scroll a panel'], ['z', 'select text'], ['/', 'filter'], ['.', 'repeat last pick'], ['!', 'pin a key'],
  ]]);
  sections.push(['Post mode (Alt+I)', [
    ['j k', 'move'], ['l r t b', 'like, reply, repost, bookmark'], ['m p', 'mute, play'], ['o', 'open'],
    ['c', 'copy link'], ['y', 'copy text'], ['s', 'save as image'], ['f', 'hints in the post'],
  ]]);
  return sections;
}

function startHelp() {
  const { host, root } = createHost();
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
  setState({ phase: 'help', host });
}

function helpKey(e) {
  setState(IDLE);
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (e.key !== '?') idleKey(e); // "?" goes on to the site
}
