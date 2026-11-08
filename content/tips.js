// One-time tips: each shows once, ever (across all sites), in the moment it's useful. No popups,
// no notifications, nothing to click: a note for a few seconds. All tips can be turned off in settings.
//   own-keys  first visit to a site whose single keys KeyHints leaves alone (YouTube, Gmail…)
//   video     first video playing on YouTube / Netflix: the video keys
//   posts     first visit to X: post mode
// Loaded after store.js, ui.js and video.js.

const TIPS = {
  'own-keys': () => `KeyHints leaves ${location.hostname.replace(/^www\./, '')}'s own single keys alone. Alt+J still shows hints; the toolbar button gives f back to KeyHints.`,
  video: () => 'Video keys: [ ] ±30 s · < > speed · s skip intro or ad · Shift+T time left · ? every key',
  posts: () => 'Alt+I: post mode. j / k move between posts · l like · r reply · c copy link · Esc exit',
};

// Tips queue up so two never overlap (on YouTube the video tip can follow the own-keys tip).
let tipQueue = Promise.resolve();
const showTip = (id) => { tipQueue = tipQueue.then(() => tipOnce(id)); };

// Marks the tip seen before showing it, so it never shows twice in one tab; two tabs
// opening at the same moment could each show it once, which is harmless.
async function tipOnce(id) {
  const { tipsOff, tipsSeen = [] } = await chrome.storage.local.get(['tipsOff', 'tipsSeen']);
  if (tipsOff || tipsSeen.includes(id)) return;
  await chrome.storage.local.set({ tipsSeen: [...tipsSeen, id] });
  const { host, root } = createHost(); // ui.js
  const style = document.createElement('style');
  style.textContent = `.tip { position: fixed; left: 50%; transform: translateX(-50%); bottom: 64px; max-width: min(640px, 90vw);
    padding: 9px 16px; border-radius: 8px; font: 14px/1.45 system-ui, sans-serif; text-align: center;
    background: var(--surface); color: var(--surface-fg); box-shadow: var(--shadow); }
    .tip small { display: block; opacity: .65; font-size: 12px; margin-top: 2px; }`;
  const div = document.createElement('div');
  div.className = 'tip';
  div.textContent = TIPS[id]();
  const note = document.createElement('small');
  note.textContent = 'KeyHints tip · shown once · turn tips off in settings';
  div.append(note);
  root.append(style, div);
  await new Promise((done) => setTimeout(done, 7000));
  host.remove();
}

if (window === window.top) {
  ready.then(() => { // store.js
    if (hasOwnKeys(location.hostname) && siteDisabled()) showTip('own-keys');
    else if (/(^|\.)(x|twitter)\.com$/.test(location.hostname)) showTip('posts');
  });
  if (VIDEO_SITE) { // video.js
    document.addEventListener('playing', (e) => {
      if (e.target.tagName === 'VIDEO' && e.target === mainVideo()) setTimeout(() => showTip('video'), 1500);
    }, true);
  }
}
