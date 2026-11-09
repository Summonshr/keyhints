// One-time tips: each shows once, ever (across all sites), in the moment it's useful. No popups,
// nothing to click: a note for a few seconds. All tips can be turned off in settings.
//   own-keys  first visit to a site whose single keys KeyHints leaves alone (YouTube, Gmail…)
//   video     first video playing on YouTube / Netflix: the video keys
//   posts     first visit to X: post mode

import { hasOwnKeys } from '../shared/settings';
import { call } from '../shared/messages';
import { createHost } from '../dom/overlay';
import { alive } from './lifecycle';
import { host, ready, siteDisabled } from './store';
import { mainVideo, VIDEO_SITE } from './video';

const TIPS: Record<string, () => string> = {
  'own-keys': () => `KeyHints leaves ${host.replace(/^www\./, '')}'s own single keys alone. Alt+J still shows hints; the toolbar button gives f back to KeyHints.`,
  video: () => 'Video keys: [ ] ±30 s · < > speed · s skip intro or ad · Shift+T time left · ? every key',
  posts: () => 'Alt+I: post mode. j / k move between posts · l like · r reply · c copy link · Esc exit',
};

// Tips queue up so two never overlap (on YouTube the video tip can follow the own-keys tip).
let queue = Promise.resolve();
const showTip = (id: string) => { queue = queue.then(() => tipOnce(id)); };

async function tipOnce(id: string) {
  if (!alive()) return;
  const { show } = await call('tip-once', { id }); // checks and marks it seen in one step
  if (!show) return;
  const { host: overlay, root } = createHost();
  const div = document.createElement('div');
  div.className = 'tip';
  div.textContent = TIPS[id]();
  const note = document.createElement('small');
  note.textContent = 'KeyHints tip · shown once · turn tips off in settings';
  div.append(note);
  root.append(div);
  await new Promise((done) => setTimeout(done, 7000));
  overlay.remove();
}

export function installTips() {
  ready.then(() => {
    if (hasOwnKeys(host) && siteDisabled()) showTip('own-keys');
    else if (/(^|\.)(x|twitter)\.com$/.test(host)) showTip('posts');
  });
  if (VIDEO_SITE) {
    document.addEventListener('playing', (e) => {
      const v = e.target as Element;
      if (v.tagName === 'VIDEO' && v === mainVideo()) setTimeout(() => showTip('video'), 1500);
    }, true);
  }
}
