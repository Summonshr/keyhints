// Fixture pages for the end-to-end tests, served by harness.ts.
/* eslint-disable */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const fixtureDir = join(import.meta.dirname, 'fixtures');
export const fixture = readFileSync(join(fixtureDir, 'fixture.html'), 'utf8');

export const framePage = `<body style="margin:4px;font:14px sans-serif">
  <button id="fbtn" onclick="parent.postMessage('fbtn', '*')">Frame button</button>
  <a id="flink" href="/framelink">Frame link</a> <input id="finput"></body>`;

// /big: ~20k elements, for timing.
export const big = '<body>' + Array.from({ length: 2000 }, (_, i) =>
  `<div class="r"><span>row ${i}</span><span>a</span><span>b</span><span>c</span><em>d</em><b>e</b>` +
  `${i % 10 === 0 ? `<a href="/b${i}">link ${i}</a>` : '<i>f</i>'}<small>g</small><u>h</u></div>`).join('') + '</body>';

// /feed: posts with like / reply buttons, a timestamp link, and a mute button that only shows on hover.
export const feed = '<body style="font:14px sans-serif;margin:20px"><h1>Feed</h1>' + Array.from({ length: 6 }, (_, i) => `
  <article data-i="${i}" style="border:1px solid #ccc;margin:10px 0;padding:10px;height:200px">
    <a href="/post/${i}"><time>${i}h</time></a> <span>Post number ${i}</span>
    <div><button aria-label="Like" data-testid="like" onclick="window.acts=(window.acts||[]).concat('like${i}')">♥</button>
      <button aria-label="Reply" onclick="window.acts=(window.acts||[]).concat('reply${i}')">↩</button></div>
    <div class="vid" onmouseenter="this.querySelector('button').style.display='inline-block'" style="display:inline-block">
      <video style="width:200px;height:60px;background:#333"></video>
      <button aria-label="Mute" style="display:none" onclick="window.acts=(window.acts||[]).concat('mute${i}')">🔈</button></div>
  </article>`).join('') + '</body>';

// /pager: a "Next ›" link far below the fold; /pager2: only a rel=prev link.
export const logKeys = `<script>addEventListener('keydown', (e) => { window.pageKeys = (window.pageKeys || []).concat(e.key); });</script>`;
export const pager = `<meta charset="utf-8"><body style="font:14px sans-serif"><h1>Page 1</h1><div style="height:3000px"></div>
  <a href="/other">Other</a> <a href="/pager2">Next ›</a>${logKeys}</body>`;
export const pager2 = `<body style="font:14px sans-serif"><h1>Page 2</h1><a rel="prev" href="/pager">1</a></body>`;
// /nav: an X-like sidebar plus enough other links that fresh labels take two keys.
export const nav = `<body style="font:14px sans-serif;margin:10px"><nav>
  <a id="home" href="#home">Home</a> <a id="explore" href="#explore">Explore</a> <a id="notif" href="#notifications">Notifications</a></nav>
  <div style="display:grid;grid-template-columns:repeat(10,80px)">${Array.from({ length: 40 }, (_, i) => `<a href="#f${i}">Filler ${i}</a>`).join('')}</div>
  ${logKeys}</body>`;
// /names: labels from text, a link nested in a same-address link, and a faded-out menu button.
export const names = `<body style="font:14px sans-serif;margin:10px">
  <a id="score" href="#score">Score card</a> <a id="search" href="#search">Search</a> <a id="explore" href="#explore">Explore</a>
  <a id="row" href="/watch?v=1" style="display:block;width:300px;padding:10px;background:#eee">Row title </a>
  <div style="opacity:0"><button id="ghost">Action menu</button></div>
  <script>const t = document.createElement('a'); t.id = 'thumb'; t.href = '/watch?v=1'; t.textContent = 'thumbnail';
    document.getElementById('row').appendChild(t);</script></body>`;
// /xfeed: X-like posts: counts on the action bar's label, the post's words in tweetText.
export const xfeed = '<body style="font:14px sans-serif;margin:20px">' + Array.from({ length: 4 }, (_, i) => `
  <article style="border:1px solid #ccc;margin:10px 0;padding:10px;height:220px;background:#fff">
    <a href="/status/${i}"><time>${i}h</time></a><div data-testid="tweetText">Hello post ${i}</div>
    <div role="group" aria-label="1 reply, 3 reposts, ${10 + i} likes, 2 bookmarks, 95${i} views">
      <button aria-label="1 Reply. Reply">↩</button> <button aria-label="${10 + i} Likes. Like">♥</button></div>
  </article>`).join('') + '</body>';
// Fake github.com pull request files ("changes" view) and a fake Jira issue.
export const githubPull = `<!doctype html><body style="margin:0;font:14px sans-serif">
  <header style="position:sticky;top:0;height:60px;background:#eee">GitHub</header>
  ${['a.php', 'b.php', 'c.php'].map((f, i) => `<div role="region" id="diff-${i}" style="height:900px;border-top:2px solid #999">
    <div data-file-path="${f}">${f} <button aria-pressed="false" aria-label="Not Viewed"
      onclick="const v = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', v); this.setAttribute('aria-label', v ? 'Viewed' : 'Not Viewed')">Viewed</button></div>
    ${i === 1 ? '<div data-testid="review-thread" style="margin-top:400px">Looks wrong</div>' : ''}</div>`).join('')}
  <div style="height:1200px"></div>${logKeys}</body>`;
// /learn: a JS-only "button" (no role, no pointer cursor) that opens something, next to plain text.
export const learnPage = `<meta charset="utf-8"><body style="font:14px sans-serif;margin:20px">
  <div data-testid="open-panel" id="jsbtn" style="width:140px;height:30px;background:#ddd">Open panel</div>
  <p id="plaintext">Plain words, clicking them does nothing.</p><div id="panel"></div>
  <script>jsbtn.addEventListener('click', () => { const d = document.createElement('div'); d.textContent = 'panel'; panel.append(d); });</script></body>`;
// /nav2: Home and Help share the initial H.
export const nav2 = `<body style="font:14px sans-serif;margin:10px"><nav><a id="home2" href="#home">Home</a> <a id="help2" href="#help">Help</a></nav>
  <div style="display:grid;grid-template-columns:repeat(10,80px)">${Array.from({ length: 40 }, (_, i) => `<a href="#g${i}">Item ${i}</a>`).join('')}</div>
  ${logKeys}</body>`;
export const slowPage = `<body><a id="early" href="#early">Early link</a><img src="/slow.png"></body>`;
export const bfPage = `<body><a id="bflink" href="/pager2">To page 2</a>
  <script>addEventListener('pageshow', (e) => { window.restored = e.persisted; });</script></body>`;
// Fake Google and YouTube search pages: result titles get 1–9, 0; thumbnails and the rest keep letters.
export const googleSearch = `<!doctype html><body style="margin:0;font:14px sans-serif"><a href="/settings">Settings</a>
  <div id="search">${Array.from({ length: 12 }, (_, i) => `<div style="height:56px">
    <a href="/r${i + 1}"><h3 style="margin:0;font-size:16px">Result ${i + 1}</h3></a> <a href="/more${i + 1}">More</a></div>`).join('')}</div></body>`;
export const youtubeResults = `<!doctype html><body style="margin:0;font:14px sans-serif"><ytd-search style="display:block">
  ${Array.from({ length: 3 }, (_, i) => `<div style="height:80px"><a id="thumbnail" href="/watch?v=${i + 1}">▶</a>
    <a id="video-title" href="/watch?v=${i + 1}">Video ${i + 1}</a> <a href="/@chan${i + 1}">Channel ${i + 1}</a></div>`).join('')}
  </ytd-search></body>`;
// Fake YouTube watch page with a playlist panel above the sidebar.
export const youtubeWatchList = `<!doctype html><body style="margin:0;font:14px sans-serif"><a href="/">Home</a>
  <ytd-playlist-panel-renderer style="display:block">${Array.from({ length: 2 }, (_, i) => `<ytd-playlist-panel-video-renderer style="display:block;height:60px">
    <a id="wc-endpoint" href="/watch?v=p${i + 1}&list=L">Playlist ${i + 1}</a></ytd-playlist-panel-video-renderer>`).join('')}</ytd-playlist-panel-renderer>
  ${Array.from({ length: 2 }, (_, i) => `<div style="height:60px"><a class="ytLockupViewModelContentImage" href="/watch?v=s${i + 1}">▶</a>
    <a class="ytLockupMetadataViewModelTitle" href="/watch?v=s${i + 1}">Next up ${i + 1}</a></div>`).join('')}</body>`;
// /ctx: a row with a custom context menu, built on the contextmenu event.
export const ctxPage = `<body style="font:14px sans-serif;margin:20px"><div id="row" role="button" tabindex="0" style="padding:8px;background:#eee"
  oncontextmenu="event.preventDefault(); window.ctx = { button: event.button, x: event.clientX > 0 }; menu.hidden = false">File.txt</div>
  <div id="menu" hidden>Rename</div></body>`;
export const jiraIssue = `<!doctype html><body><h1>ABC-42 Fix the thing</h1>${logKeys}</body>`;


// Fake watch pages (YouTube, Netflix). Both log keys that reach the page, and have a search box and a comment box.
export const watchPage = (extra: string) => `<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px sans-serif">
  <input id="search" placeholder="Search"> <div id="comment" contenteditable="true" style="display:inline-block;min-width:100px">c</div>
  <video id="v" src="/media/clip.webm" preload="auto" muted style="display:block;width:800px;height:450px;background:#000"></video>
  ${extra}
  <script>addEventListener('keydown', (e) => { window.pageKeys = (window.pageKeys || []).concat(e.key); });</script></body>`;
export const youtubeWatch = watchPage(`<button class="ytp-ad-skip-button-modern" style="display:none"
  onclick="window.skipped = true">Skip</button>`);
export const netflixWatch = watchPage(`
  <button data-uia="player-skip-intro" style="display:none" onclick="window.skipped = true">Skip Intro</button>
  <button data-uia="next-episode-seamless-button" style="display:none" onclick="window.nexted = true">Next Episode</button>
  <script>
    // Stub of Netflix's player API; records seeks. Any write to video.currentTime is counted (M7375).
    const v = document.getElementById('v');
    window.seeks = [];
    window.currentTimeWrites = 0;
    Object.defineProperty(v, 'currentTime', { get: () => HTMLMediaElement.prototype.__lookupGetter__('currentTime').call(v), set: () => { window.currentTimeWrites++; } });
    const player = { getCurrentTime: () => v.currentTime * 1000, getDuration: () => v.duration * 1000, seek: (ms) => window.seeks.push(ms) };
    window.netflix = { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: {
      getAllPlayerSessionIds: () => ['watch-123'], getVideoPlayerBySessionId: () => player } }) } } } };
  </script>`);
