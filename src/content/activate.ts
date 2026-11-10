// What a pick does, per mode: click, copy, open in the background, hover, right click, focus,
// scroll a panel, or start selecting text.

import type { ModeId } from '../core/modes';
import { call } from '../shared/messages';
import { flash, toast } from '../dom/overlay';
import { CLICK_EVENTS, dispatchMouse, focusField, hover, pointAt, rightClick } from '../dom/mouse';
import { elementText, findClickables, isTextField, linkHref, visibleRect } from '../dom/targets';
import { elementId } from '../dom/identity';
import { isLearned } from './store';

export interface Pickable {
  el: Element;
  rect: DOMRect;
  text?: string;
  href?: string | null;
  id?: string | null; // identity key, to find it again if the page re-rendered it
  unique?: boolean; // the only element on screen with that identity
  textNode?: Text;
}

// The text-selection mode registers itself here (visual.ts), so this module doesn't import it.
let startVisual: (node: Text) => void = () => { throw new Error('KeyHints: text selection not loaded'); };
export const setStartVisual = (fn: typeof startVisual) => { startVisual = fn; };

export const openTab = (url: string | null | undefined) => (url ? call('open-tab', { url }) : toast('Not a link'));

// `show`: whether the note names what was copied (not for text from a frame of another site: the
// note is drawn in this page).
export async function copyText(text: string | null | undefined, what: string, show = true) {
  if (!text) return toast('Nothing to copy');
  try {
    await navigator.clipboard.writeText(text);
    toast(show ? `${what}: ${text}` : what);
  } catch (err) {
    toast(`Copy failed: ${(err as Error).message}`);
  }
}

// Elements can be re-rendered (feeds do this constantly) between showing hints and picking.
function refind(t: Pickable): Pickable | null {
  if (!t.unique || !t.id) return null; // with identical copies around, we can't know which one was meant
  const again = findClickables(isLearned).filter((c) => elementId(c.el, c.text) === t.id);
  return again.length === 1 ? again[0] : null;
}

function focusScrollable(el: HTMLElement) {
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1; // focusable, so arrow keys scroll it
  el.focus({ preventScroll: true });
  toast('Panel focused: arrows, Space and PgUp/PgDn now scroll it');
}

export function activate(target: Pickable, mode: ModeId) {
  let t: Pickable | null = target;
  if (!t.el.isConnected) {
    t = refind(t);
    if (!t) return toast('The page changed. Press Alt+J again');
  }
  const el = t.el as HTMLElement;
  const rect = t.textNode ? t.rect : visibleRect(el) || t.rect; // text starts keep their range rect
  flash(rect);
  if (mode === 'copy') return copyText(t.href, 'Copied link');
  if (mode === 'newtab' || mode === 'multi') return openTab(t.href);
  if (mode === 'focus') return isTextField(el) ? focusField(el) : el.focus();
  if (mode === 'hover') return hover(el, rect);
  if (mode === 'context') return rightClick(el, rect);
  if (mode === 'scroll') return focusScrollable(el);
  if (mode === 'text') return startVisual(t.textNode!);

  // click
  if (isTextField(el)) return focusField(el);
  if (el.tagName === 'SELECT') {
    el.focus();
    return (el as HTMLSelectElement).showPicker();
  }
  const { target: hit, x, y } = pointAt(el, rect);
  dispatchMouse(hit, CLICK_EVENTS, x, y);
  if (el.isConnected) el.focus({ preventScroll: true });
}

// Clicks an element found by a site rule (page links, post buttons, video buttons).
export function activateEl(el: Element) {
  activate({ el, rect: visibleRect(el) || el.getBoundingClientRect(), text: elementText(el), href: linkHref(el) }, 'click');
}
