// Video controls on YouTube and Netflix: single keys, no leader, only while a video is on screen
// and you're not typing.
//   [ ]  back / forward 30s        { }  back / forward 60s
//   < >  speed down / up by 0.25× (0.5×–3×)
//   0–9  jump to 0–90% (Netflix; YouTube does this itself)
//   s    skip intro / recap / ad (clicks the site's own button)
//   Shift+N  next episode (Netflix; YouTube does this itself)
//   Shift+T  show time and time left

const VIDEO_SITE = /(^|\.)youtube\.com$/.test(location.hostname) ? 'youtube'
  : /(^|\.)netflix\.com$/.test(location.hostname) ? 'netflix' : null;

const SPEED_MIN = 0.5, SPEED_MAX = 3, SPEED_STEP = 0.25;
let wantedRate = null; // speed chosen with < >; sites reset it when a new video or an ad loads
let osdHost = null;

const SKIP_BUTTONS = {
  netflix: '[data-uia="player-skip-intro"], [data-uia="player-skip-recap"], [data-uia="player-skip-preplay"], [data-uia="player-skip-credits"]',
  youtube: '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button',
};
const NEXT_BUTTONS = {
  netflix: '[data-uia="next-episode-seamless-button"], [data-uia="next-episode-seamless-button-draining"], [data-uia="control-next"]',
  youtube: '.ytp-next-button',
};

// The biggest playing-size video on screen.
function mainVideo() {
  if (!VIDEO_SITE) return null;
  return [...document.querySelectorAll('video')]
    .map((v) => ({ v, r: v.getBoundingClientRect() }))
    .filter(({ v, r }) => r.width > 100 && r.height > 60 && v.duration > 0 && inViewport(r))
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)
    .map(({ v }) => v)[0] || null;
}

function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// A short label over the video ("+30s", "1.5×"). A new one replaces the previous one.
function osd(text) {
  const v = mainVideo();
  if (osdHost) osdHost.remove();
  const { host, root } = createHost();
  osdHost = host;
  const div = document.createElement('div');
  div.className = 'osd';
  div.textContent = text;
  if (v) {
    const r = v.getBoundingClientRect();
    div.style.left = `${r.left + r.width / 2}px`;
    div.style.top = `${Math.max(r.top, 0) + Math.min(r.height, innerHeight) * 0.12}px`;
  }
  root.appendChild(div);
  setTimeout(() => { if (osdHost === host) { host.remove(); osdHost = null; } }, 1200);
}

// Netflix: seek only through its player API, in the page's own context (netflix-main.js).
function netflixCall(op, value) {
  document.dispatchEvent(new CustomEvent('keyhints-netflix', { detail: JSON.stringify({ op, value }) }));
}

function seekBy(seconds) {
  const v = mainVideo();
  const target = Math.min(Math.max(v.currentTime + seconds, 0), v.duration);
  if (VIDEO_SITE === 'netflix') netflixCall('seekBy', seconds * 1000);
  else v.currentTime = target;
  osd(`${seconds > 0 ? '+' : '−'}${Math.abs(seconds)}s · ${clock(target)}`);
}

function seekToFraction(fraction) {
  const v = mainVideo();
  if (VIDEO_SITE === 'netflix') netflixCall('seekToFraction', fraction);
  else v.currentTime = v.duration * fraction;
  osd(`${Math.round(fraction * 100)}% · ${clock(v.duration * fraction)}`);
}

function changeSpeed(step) {
  const v = mainVideo();
  const rate = Math.min(Math.max(Math.round((v.playbackRate + step) / SPEED_STEP) * SPEED_STEP, SPEED_MIN), SPEED_MAX);
  wantedRate = rate;
  v.playbackRate = rate;
  osd(`${rate}×`);
}

function showTime() {
  const v = mainVideo();
  osd(`${clock(v.currentTime)} / ${clock(v.duration)} · ${clock(v.duration - v.currentTime)} left`);
}

function siteButton(selector, textMatch) {
  const els = [...document.querySelectorAll(selector)];
  if (textMatch) {
    for (const b of document.querySelectorAll('button, [role=button]')) {
      if (textMatch.test((b.getAttribute('aria-label') || b.innerText || '').trim())) els.push(b);
    }
  }
  return els.find((el) => visibleRect(el)) || null;
}

// Players hide their controls until the mouse moves; nudge them, then click the site's button.
async function pressSiteButton(selector, textMatch, what) {
  let el = siteButton(selector, textMatch);
  if (!el) {
    const v = mainVideo();
    if (v) {
      const r = v.getBoundingClientRect();
      dispatchMouse(v, ['pointermove', 'mousemove', 'pointerover', 'mouseover'], r.left + r.width / 2, r.top + r.height / 2);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    el = siteButton(selector, textMatch);
  }
  if (!el) return osd(`No ${what} button right now`);
  activate({ el, rect: visibleRect(el), text: elementText(el), href: null, unique: false }, 'click');
  osd(what === 'skip' ? 'Skipped' : 'Next episode');
}

const skip = () => pressSiteButton(SKIP_BUTTONS[VIDEO_SITE], /^skip\b/i, 'skip');
const nextEpisode = () => pressSiteButton(NEXT_BUTTONS[VIDEO_SITE], /^next( episode)?\b/i, 'next episode');

// Sites put the speed back to 1× when a new video or an ad loads; put the chosen one back.
// (Media events don't bubble, but capture listeners on the document still see them.)
for (const type of ['loadedmetadata', 'playing']) {
  document.addEventListener(type, (e) => {
    if (VIDEO_SITE && wantedRate && e.target.tagName === 'VIDEO' && e.target.playbackRate !== wantedRate) e.target.playbackRate = wantedRate;
  }, true);
}

// Returns true if the key was a video control (and was handled).
function videoKey(e) {
  if (!VIDEO_SITE || e.ctrlKey || e.altKey || e.metaKey || isTyping(e) || !mainVideo()) return false;
  const youtube = VIDEO_SITE === 'youtube';
  const keys = {
    '[': () => seekBy(-30), ']': () => seekBy(30), '{': () => seekBy(-60), '}': () => seekBy(60),
    '<': () => changeSpeed(-SPEED_STEP), '>': () => changeSpeed(SPEED_STEP),
    s: skip, T: showTime,
    ...(youtube ? {} : { N: nextEpisode }), // YouTube: Shift+N and 0–9 are its own
  };
  let action = keys[e.key];
  if (!action && !youtube && /^[0-9]$/.test(e.key)) action = () => seekToFraction(Number(e.key) / 10);
  if (!action) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  action();
  return true;
}

// For the hint bar, so the keys can be discovered.
function videoKeysHelp() {
  if (!mainVideo()) return [];
  return [['[ ]', '±30s'], ['{ }', '±60s'], ['< >', 'speed'], ['s', 'skip'],
    ...(VIDEO_SITE === 'netflix' ? [['0–9', 'jump'], ['N', 'next']] : []), ['T', 'time']];
}

// For the palette (and voice): "skip intro", "speed up", "time left"…
const VIDEO_COMMANDS = VIDEO_SITE ? [
  ['Skip intro / recap / ad', 'skip intro recap ad credits', skip],
  ['Next episode', 'next episode', nextEpisode],
  ['Forward 30 seconds', 'forward ahead skip 30 seconds', () => seekBy(30)],
  ['Back 30 seconds', 'back rewind 30 seconds', () => seekBy(-30)],
  ['Forward 1 minute', 'forward ahead one 1 minute 60 seconds', () => seekBy(60)],
  ['Back 1 minute', 'back rewind one 1 minute 60 seconds', () => seekBy(-60)],
  ['Speed up', 'faster speed up', () => changeSpeed(SPEED_STEP)],
  ['Slow down', 'slower speed down', () => changeSpeed(-SPEED_STEP)],
  ['Show time left', 'time remaining left how long', showTime],
].map(([title, words, run]) => ({ kind: 'command', title, words, run: () => (mainVideo() ? run() : toast('No video on screen')) })) : [];
