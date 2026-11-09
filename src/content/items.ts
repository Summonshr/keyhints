// Post mode (Alt+I): j/k move a highlight between posts, cards and results; single keys act on it.

import { call } from '../shared/messages';
import { createHost, makeBar, placeBar, renderBar, toast } from '../dom/overlay';
import { contains, deepElementFromPoint, elementText, allElements, CLICKABLE, inViewport, isUsable, linkHref, visibleRect } from '../dom/targets';
import { dispatchMouse } from '../dom/mouse';
import { activate, activateEl, copyText, openTab } from './activate';
import { start } from './hints';
import { IDLE, inPhase, onLeave, setState, state } from './state';

const ITEM_SELECTOR = [
  'article', '[role=article]', '[role=feed] > *', '[role=listitem]',
  'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', // YouTube
  'shreddit-post', 'tr.athing', '#search .g', // Reddit, Hacker News, Google results
].join(',');

// Buttons inside a post, found by their accessible name (aria-label, data-testid, title, short text).
const ITEM_ACTIONS: Record<string, { name: string; match: RegExp }> = {
  l: { name: 'like', match: /\b(like|unlike|liked|favou?rite)\b/ },
  r: { name: 'reply', match: /\b(reply|replies|comment|comments)\b/ },
  t: { name: 'repost', match: /\b(repost|retweet|share)\b/ },
  b: { name: 'bookmark', match: /\b(bookmark|save)\b/ },
  m: { name: 'mute', match: /\b(mute|unmute|volume)\b/ },
  p: { name: 'play / pause', match: /\b(play|pause)\b/ },
};

function findItems(): Element[] {
  return [...document.querySelectorAll(ITEM_SELECTOR)]
    .filter((el) => !(el.parentElement && el.parentElement.closest(ITEM_SELECTOR))) // outermost only (quoted posts)
    .filter((el) => !el.closest('nav, header, aside, [role=navigation], [role=banner], [role=complementary]'))
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.height >= 10 && rect.width >= 50) // Hacker News rows are ~19px
    .sort((a, b) => a.rect.top - b.rect.top)
    .map(({ el }) => el);
}

function nearestCentre(els: Element[]): Element {
  const dist = (el: Element) => {
    const r = el.getBoundingClientRect();
    return Math.abs(r.top + Math.min(r.height, innerHeight) / 2 - innerHeight / 2);
  };
  return els.slice().sort((a, b) => dist(a) - dist(b))[0];
}

export function startItems() {
  const items = findItems();
  if (!items.length) return toast('No posts or cards found on this page');
  const { host, root } = createHost();
  const ring = document.createElement('div');
  ring.className = 'ring';
  const chip = document.createElement('div');
  chip.className = 'chip';
  root.append(ring, chip);
  const bar = makeBar(root);
  setState({ phase: 'items', current: nearestCentre(items), host, ring, chip, bar });
  addEventListener('scroll', drawItem, { capture: true, passive: true });
  addEventListener('resize', drawItem);
  renderBar(bar, 'POST', [
    ['j k', 'move'], ['l', 'like'], ['r', 'reply'], ['t', 'repost'], ['b', 'bookmark'], ['m', 'mute'], ['p', 'play'],
    ['o', 'open'], ['c', 'copy link'], ['y', 'copy text'], ['s', 'save image'], ['f', 'hints in post'], ['Esc', 'exit'],
  ]);
  drawItem();
}

onLeave('items', (prev) => {
  prev.host.remove();
  removeEventListener('scroll', drawItem, { capture: true });
  removeEventListener('resize', drawItem);
});

function drawItem() {
  const s = inPhase('items');
  if (!s) return;
  if (!s.current.isConnected) { // feeds recycle their elements while scrolling
    const items = findItems();
    if (!items.length) return setState(IDLE);
    s.current = nearestCentre(items);
  }
  const r = s.current.getBoundingClientRect();
  Object.assign(s.ring.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
  // The post's counts sit on the ring's top edge (inside it when the post starts above the screen).
  s.chip.textContent = postStats(s.current);
  Object.assign(s.chip.style, { left: `${Math.max(r.left, 4)}px`, top: `${r.top > 26 ? r.top - 24 : Math.max(r.top, 0) + 4}px` });
  placeBar(s.bar, [s.ring]);
}

// Counts from the post's own labels: X puts them on its action bar ("1 reply, 3 reposts, 9 likes,
// 951 views"); elsewhere they're on the buttons ("12 Likes. Like"). Most-wanted first.
const STATS: [string, RegExp][] = [['views', /^views?$/], ['likes', /^likes?$/], ['bookmarks', /^bookmarks?$/],
  ['reposts', /^(reposts?|retweets?)$/], ['replies', /^(repl(y|ies)|comments?)$/]];

function postStats(item: Element): string {
  const found: Record<string, string> = {};
  for (const el of item.querySelectorAll('[role=group][aria-label], button[aria-label], a[aria-label]')) {
    for (const [, count, word] of el.getAttribute('aria-label')!.matchAll(/([\d.,]+[KMB]?)\s+([a-z]+)/gi)) {
      const stat = STATS.find(([, re]) => re.test(word.toLowerCase()));
      if (stat && !(stat[0] in found)) found[stat[0]] = `${count} ${word.toLowerCase()}`;
    }
  }
  return STATS.filter(([name]) => name in found).map(([name]) => found[name]).join(' · ');
}

// The post's own words: X's tweet text (the first one is the post's, a quoted post's comes after), else all of it.
function postText(item: Element): string {
  const own = item.querySelector<HTMLElement>('[data-testid="tweetText"]');
  return (own || (item as HTMLElement)).innerText.trim();
}

export const copyPostText = (item: Element) => copyText(postText(item), 'Copied post text');

// Screenshot of the post, saved to Downloads. A post taller than the screen is saved from its top
// down to the bottom of the screen.
export async function savePostImage(item: Element) {
  const tall = item.getBoundingClientRect().height > innerHeight;
  item.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'instant' });
  const overlay = state.phase === 'items' ? state.host : null;
  if (overlay) overlay.style.visibility = 'hidden'; // keep the ring and bar out of the picture
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))));
  const r = item.getBoundingClientRect();
  let res;
  try {
    res = await call('capture');
  } finally {
    if (overlay) overlay.style.visibility = '';
  }
  if (!res.ok) return toast(`Couldn't capture the page: ${res.error}`);
  const bytes = Uint8Array.from(atob(res.dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const shot = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const scale = shot.width / innerWidth;
  const left = Math.max(r.left, 0), top = Math.max(r.top, 0);
  const width = Math.min(r.right, innerWidth) - left, height = Math.min(r.bottom, innerHeight) - top;
  const canvas = new OffscreenCanvas(Math.round(width * scale), Math.round(height * scale));
  canvas.getContext('2d')!.drawImage(shot, left * scale, top * scale, width * scale, height * scale, 0, 0, canvas.width, canvas.height);
  const url = URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${location.hostname}-post-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast(tall ? 'Saved the post (the part that fits on screen) to Downloads' : 'Saved the post to Downloads');
}

function moveItem(step: 1 | -1) {
  const s = inPhase('items')!;
  const items = findItems();
  let i = items.indexOf(s.current);
  if (i < 0) i = items.indexOf(nearestCentre(items));
  const next = items[i + step];
  if (!next) { // at the end: scroll so the page can load more
    scrollBy({ top: step * innerHeight * 0.8 });
    return;
  }
  s.current = next;
  const tall = next.getBoundingClientRect().height > innerHeight * 0.8;
  next.scrollIntoView({ block: tall ? 'start' : 'center' });
  drawItem();
}

function actionButton(item: Element, action: { match: RegExp }): Element | null {
  const name = (el: Element) => {
    const text = (el as HTMLElement).innerText || '';
    return [el.getAttribute('aria-label'), el.getAttribute('data-testid'), el.getAttribute('title'), text.length <= 30 ? text : '']
      .filter(Boolean).join(' ').toLowerCase();
  };
  for (const el of allElements(item)) {
    if (el.matches(CLICKABLE) && isUsable(el) && action.match.test(name(el)) && visibleRect(el)) return el;
  }
  return null;
}

// Like a mouse passing over the post's centre and over each video in it: over/move bubble from the
// element under the pointer, enter fires on it and on every ancestor up to the post.
function hoverItem(item: Element) {
  const r = item.getBoundingClientRect();
  const points = [[r.left + r.width / 2, r.top + Math.min(r.height, innerHeight) / 2]];
  for (const v of item.querySelectorAll('video')) {
    const vr = v.getBoundingClientRect();
    if (inViewport(vr)) points.push([vr.left + vr.width / 2, vr.top + vr.height / 2]);
  }
  for (const [x, y] of points) {
    const hit = deepElementFromPoint(x, y);
    const target = hit && contains(item, hit) ? hit : item;
    dispatchMouse(target, ['pointerover', 'mouseover', 'pointermove', 'mousemove'], x, y);
    for (let el: Element | null = target; el; el = el === item ? null : el.parentElement) dispatchMouse(el, ['pointerenter', 'mouseenter'], x, y);
  }
}

// Clicks the post's l / r / … button. Controls that only appear on hover get a hover first.
async function act(item: Element, key: string) {
  const action = ITEM_ACTIONS[key];
  let el = actionButton(item, action);
  if (!el) {
    hoverItem(item);
    await new Promise((resolve) => setTimeout(resolve, 200));
    el = actionButton(item, action);
  }
  if (!el) return toast(`No ${action.name} button in this post`);
  activateEl(el);
}

// The link that stands for the whole post: its timestamp (X), its title (HN, YouTube, results).
function primaryLink(item: Element): HTMLAnchorElement | null {
  const links = [...item.querySelectorAll<HTMLAnchorElement>('a[href]')].filter((a) => linkHref(a));
  return links.find((a) => a.querySelector('time')) ||
    item.querySelector<HTMLAnchorElement>('h1 a[href], h2 a[href], h3 a[href], .titleline a[href], a#video-title-link, a#video-title, a#thumbnail') ||
    links.sort((a, b) => b.innerText.length - a.innerText.length)[0] || null;
}

// Runs `fn` on the post nearest the middle of the screen (palette and voice commands).
export function onCentre(fn: (item: Element) => unknown) {
  const items = findItems();
  if (!items.length) return toast('No posts or cards found on this page');
  fn(nearestCentre(items));
}

export const actOnCentre = (key: string) => onCentre((item) => act(item, key));

export function itemKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab') return setState(IDLE);
  e.preventDefault();
  e.stopImmediatePropagation();
  const item = inPhase('items')!.current;
  const key = e.key.toLowerCase();
  if (e.key === 'Escape') return setState(IDLE);
  if (key === 'j' || e.key === 'ArrowDown') return moveItem(1);
  if (key === 'k' || e.key === 'ArrowUp') return moveItem(-1);
  if (key === 'f') return start('click', item);
  if (key === 'o' || e.key === 'Enter') {
    const link = primaryLink(item);
    if (!link) return activate({ el: item, rect: item.getBoundingClientRect(), text: elementText(item) }, 'click');
    if (e.shiftKey) return openTab(linkHref(link));
    setState(IDLE);
    return activateEl(link);
  }
  if (key === 'c') {
    const link = primaryLink(item);
    return link ? copyText(linkHref(link), 'Copied link') : toast('No link in this post');
  }
  if (key === 'y') return copyPostText(item);
  if (key === 's') return savePostImage(item);
  if (ITEM_ACTIONS[key]) return act(item, key);
}
