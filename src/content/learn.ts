// Learning from the mouse: when you click something KeyHints gave no hint to, and the click did
// something (the address changed, focus moved, or the page added or removed elements within half a
// second), a selector for it is saved for this site and it gets a hint from then on.
// Only real clicks count (isTrusted), so KeyHints' own clicks never teach it anything.

import { stableId } from '../core/identity';
import { call } from '../shared/messages';
import { toast } from '../dom/overlay';
import { CLICKABLE } from '../dom/targets';
import { alive } from './lifecycle';
import { host, isLearned, learned } from './store';

const MAX_MATCHES = 40; // a selector matching more than this many elements is too vague to learn
const EFFECT_WINDOW = 500; // ms

// Would KeyHints give this element, or one around it, a hint? (Its rules, without the on-screen
// test: something under the mouse is on screen.)
const hintedAround = (path: Element[]) =>
  path.some((el) => el.matches(CLICKABLE) || isLearned(el) || getComputedStyle(el).cursor === 'pointer');

const cssString = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;
// Class names a build tool generated (css-1x2y3z, sc-AbCdE, jsx-123) change between deploys.
const stableClass = (c: string) => c.length <= 30 && !/\d/.test(c) && !/^(css|sc|jsx|emotion|styled)-/.test(c);

// The most specific stable description of `el`, or '' when it has none (a bare <span>).
function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  for (const attr of ['data-testid', 'aria-label', 'role', 'title', 'name']) {
    const v = el.getAttribute(attr);
    if (v && v.length <= 60 && !/\d{3,}/.test(v)) return `${tag}[${attr}=${cssString(v)}]`;
  }
  if (stableId(el.id)) return `${tag}#${CSS.escape(el.id)}`;
  const classes = [...el.classList].filter(stableClass).slice(0, 3);
  return classes.length ? `${tag}${classes.map((c) => `.${CSS.escape(c)}`).join('')}` : '';
}

// The clicked element, or the nearest of its next three ancestors, with a description specific
// enough to learn.
function learnableSelector(target: Element): string {
  for (let el: Element | null = target, depth = 0; el && depth < 4; el = el.parentElement, depth++) {
    const sel = describe(el);
    if (!sel) continue;
    const root = el.getRootNode() as Document | ShadowRoot;
    if (root.querySelectorAll(sel).length <= MAX_MATCHES) return sel;
  }
  return '';
}

// KeyHints' own overlay going up or coming down (hints, a toast, Show keys, the palette taking
// focus) is not the page reacting.
const isOverlay = (n: Node | null) => n?.nodeName === 'KEYHINTS-OVERLAY';

// Resolves true if the page reacts to the click within the window: navigation, a focus change,
// or elements added or removed (attribute and text changes alone don't count: clocks, counters).
function clickHadEffect(startUrl: string, startFocus: Element | null): Promise<boolean> {
  return new Promise((resolve) => {
    const observer = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => !isOverlay(n)))) finish(true);
    });
    const focusMoved = () => document.activeElement !== startFocus && !isOverlay(document.activeElement);
    const timer = setTimeout(() => finish(location.href !== startUrl || focusMoved()), EFFECT_WINDOW);
    function finish(result: boolean) {
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function learnFromClick(e: MouseEvent) {
  if (!e.isTrusted || e.button !== 0 || !alive()) return;
  const path = e.composedPath().filter((n): n is Element => n instanceof Element && n !== document.documentElement && n !== document.body);
  const target = path[0];
  if (!target || hintedAround(path)) return;
  const sel = learnableSelector(target);
  if (!sel || learned.includes(sel)) return;
  if (!(await clickHadEffect(location.href, document.activeElement))) return;
  const { added } = await call('learn-add', { host, selector: sel });
  if (added) toast('KeyHints will put a hint on that from now on (palette: “forget learned clicks” to undo)');
}

export const installLearning = () => addEventListener('click', learnFromClick, true);

// For the palette: forget everything learned from clicks on this site. Returns how many.
export const forgetLearned = async () => (await call('learn-forget', { host })).count;
