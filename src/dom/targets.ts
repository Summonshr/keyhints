// What gets a hint: clickables, scrollable panels, and text start points. Every rule about what is
// (or isn't) a target lives here.

export const CLICKABLE = [
  'a[href]', 'area[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea',
  'summary', 'label[for]', '[contenteditable=""]', '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])', '[onclick]',
  ...['button', 'link', 'tab', 'checkbox', 'radio', 'menuitem', 'option', 'switch', 'textbox', 'combobox']
    .map((r) => `[role=${r}]`),
].join(',');

// Input types that take typed text; these get focused instead of clicked.
const NON_TEXT_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file', 'color', 'range']);

export interface Target {
  el: Element;
  rect: DOMRect;
  text: string;
  href: string | null;
  isLink: boolean;
  textNode?: Text; // text selection starts
}

export function isTextField(el: Element | null): boolean {
  if (!el || el.nodeType !== 1) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  const role = el.getAttribute('role');
  return role === 'textbox' || role === 'combobox';
}

// The element that really has focus, through open and closed shadow roots. (An event's own path
// stops at a closed root and names the host, not the field inside it.)
function focusedElement(): Element | null {
  let el = document.activeElement;
  while (el instanceof HTMLElement) {
    const inner: Element | null | undefined = chrome.dom.openOrClosedShadowRoot(el)?.activeElement;
    if (!inner) break;
    el = inner;
  }
  return el;
}

// A text field, a select, or an element that takes text through the EditContext API.
const takesText = (el: Element | null | undefined) =>
  !!el && (isTextField(el) || el.tagName === 'SELECT' || !!(el as Element & { editContext?: unknown }).editContext);

// Is this key going into a text field or a select (where KeyHints' single keys must not act)?
export function isTyping(e: KeyboardEvent): boolean {
  return takesText(e.composedPath()[0] as Element | undefined) || takesText(focusedElement());
}

export function deepElementFromPoint(x: number, y: number): Element | null {
  let el = document.elementFromPoint(x, y);
  while (el && el.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

export function contains(el: Element, other: Element): boolean {
  return el === other || el.contains(other) || !!(el.shadowRoot && el.shadowRoot.contains(other));
}

export function* allElements(root: Node): Generator<Element> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.nextNode() as Element | null; el; el = walker.nextNode() as Element | null) {
    yield el;
    if (el.shadowRoot) yield* allElements(el.shadowRoot);
  }
}

export function inViewport(r: DOMRect): boolean {
  return r.width >= 1 && r.height >= 1 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

// The first rect of `el` that is on screen and not covered by something else.
export function visibleRect(el: Element): DOMRect | null {
  let rects = [...el.getClientRects()];
  // e.g. <a><img style="display:block"></a>: the link itself has no box, its child does.
  if (!rects.some(inViewport) && el.firstElementChild) rects = [...el.firstElementChild.getClientRects()];
  for (const r of rects) {
    if (!inViewport(r)) continue;
    const left = Math.max(r.left, 0), top = Math.max(r.top, 0);
    const right = Math.min(r.right, innerWidth), bottom = Math.min(r.bottom, innerHeight);
    for (const [x, y] of [[(left + right) / 2, (top + bottom) / 2], [left + 2, top + 2]]) {
      const hit = deepElementFromPoint(x, y);
      if (hit && contains(el, hit)) return r;
      // <label for=x> covering a visually hidden input counts as visible.
      if (hit && hit.tagName === 'LABEL' && (hit as HTMLLabelElement).control === el) return r;
    }
  }
  return null;
}

export function isUsable(el: Element): boolean {
  return !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert]');
}

// Faded out (opacity 0 or visibility: hidden, here or on an ancestor), like YouTube's row menus that
// only appear on hover. Form fields are exempt: custom checkboxes and file pickers often hide the
// real input that way and show something else in its place.
function isInvisible(el: Element): boolean {
  return !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) &&
    !el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
}

// An href as an absolute URL, or null when it can't be one ("http://", a template never filled in).
export function parseHref(raw: string): URL | null {
  try {
    return new URL(raw, document.baseURI);
  } catch {
    return null; // not an address: the element is hinted and clicked like a button
  }
}

// What a page may hand to KeyHints as a link: web, mail and phone addresses, and local files only
// from a local page. Not javascript:, data:, blob:, chrome: or extension pages: a page can't open
// those by itself, so it must not get them opened through KeyHints either.
const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

// Absolute URL of a link, or null if it isn't a link KeyHints will open or copy.
export function linkHref(el: Element): string | null {
  if (!el.matches('a[href], area[href]')) return null;
  const url = parseHref(el.getAttribute('href')!);
  if (!url) return null;
  return LINK_SCHEMES.has(url.protocol) || (url.protocol === 'file:' && location.protocol === 'file:') ? url.href : null;
}

export function elementText(el: Element): string {
  const field = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  const img = el.querySelector('img[alt]') as HTMLImageElement | null;
  const text = (field ? '' : (el as HTMLElement).innerText) || el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
    el.getAttribute('title') || el.getAttribute('name') || (img && img.alt) || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

const byPosition = (a: { rect: DOMRect }, b: { rect: DOMRect }) => a.rect.top - b.rect.top || a.rect.left - b.rect.left;

// Everything clickable on screen, in reading order. `isLearned`: selectors learned from mouse
// clicks on this site (content/learn.ts).
export function findClickables(isLearned: (el: Element) => boolean, root: Node = document.documentElement): Target[] {
  const found: { el: Element; rect: DOMRect }[] = [];
  for (const el of allElements(root)) {
    let match = el.matches(CLICKABLE) || isLearned(el);
    // Div-soup SPAs: clickable via JS only, detectable by cursor:pointer.
    if (!match && el.parentElement) {
      const r = el.getBoundingClientRect();
      match = inViewport(r) &&
        getComputedStyle(el).cursor === 'pointer' &&
        getComputedStyle(el.parentElement).cursor !== 'pointer' &&
        !el.parentElement.closest(CLICKABLE);
    }
    if (!match || !isUsable(el) || isInvisible(el)) continue;
    const rect = visibleRect(el);
    if (rect) found.push({ el, rect });
  }
  // A <label for> and its own control would get two hints; keep the control. A link inside a bigger
  // link to the same address (YouTube's thumbnail inside its playlist row) is the same pick twice;
  // keep the outer one.
  const els = new Set(found.map((t) => t.el));
  const insideSameLink = (el: Element, href: string | null) => {
    const outer = href && el.parentElement && el.parentElement.closest('a[href]');
    return !!outer && els.has(outer) && linkHref(outer) === href;
  };
  return found
    .filter(({ el }) => !(el.tagName === 'LABEL' && (el as HTMLLabelElement).control && els.has((el as HTMLLabelElement).control!)))
    .map((t) => {
      const href = linkHref(t.el);
      return { ...t, text: elementText(t.el), href, isLink: !!href };
    })
    .filter((t) => !insideSameLink(t.el, t.href))
    .sort(byPosition);
}

export function findScrollables(): Target[] {
  const found: Target[] = [];
  for (const el of allElements(document.documentElement)) {
    if (el === document.documentElement || el === document.body) continue; // page scroll already works
    const tall = el.scrollHeight > el.clientHeight + 1, wide = el.scrollWidth > el.clientWidth + 1;
    if (!tall && !wide) continue;
    const cs = getComputedStyle(el);
    const scrolls = (v: string) => /auto|scroll|overlay/.test(v);
    if (!((tall && scrolls(cs.overflowY)) || (wide && scrolls(cs.overflowX)))) continue;
    const rect = visibleRect(el);
    if (rect) found.push({ el, rect, text: (el.getAttribute('aria-label') || '').trim(), isLink: false, href: null });
  }
  return found.sort(byPosition);
}

// Every visible text node is a possible starting point for selecting text.
export function findTextStarts(): Target[] {
  const found: Target[] = [];
  const parentVisible = new Map<Element, boolean>();
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (node.data.trim().length < 2) continue;
    const parent = node.parentElement;
    if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION|TITLE|KEYHINTS-OVERLAY)$/.test(parent.tagName)) continue;
    if (!parentVisible.has(parent)) parentVisible.set(parent, inViewport(parent.getBoundingClientRect()));
    if (!parentVisible.get(parent)) continue;
    range.selectNodeContents(node);
    const rect = [...range.getClientRects()].find(inViewport);
    if (!rect) continue;
    const hit = deepElementFromPoint(Math.max(rect.left + 1, 0), rect.top + rect.height / 2);
    if (!hit || !(contains(parent, hit) || hit.contains(parent))) continue;
    found.push({ el: parent, textNode: node, rect, text: node.data.trim().slice(0, 200), isLink: false, href: null });
  }
  return found.sort(byPosition);
}
